"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { api, streamSSE, useApi } from "@/lib/client/api";
import { Badge, Button, PageHeader, inputCls } from "@/components/ui";
import { Mascot } from "@/components/kids";
import { TYPE_META, STAGE_LABEL } from "@/lib/contentMeta";
import { FILE_ASK, FILE_CHIPS, FILE_KIND, MAX_FILES_PER_MESSAGE, MAX_FILE_MB, STUDIO_ACCEPT, fileSummary, kindFromName } from "@/lib/studioFiles";
import type { InspirationPack } from "@/lib/schemas/content";
import type { ChatMessage, ChatThread, Child, StudioFile, StudioFileKind } from "@/lib/types";
import { ClaudeStatusBadge, useClaudeOk } from "./common";

const CHIPS = [
  "✨ Make a new topic about dinosaurs with words, a game and a quiz",
  "🎄 Make a Christmas topic: vocabulary, listening and a memory game",
  "🏖️ Make a topic about our beach trip: words, speaking and a worksheet",
  "🎮 Make a balloon game and a quiz about colors and shapes",
  "💡 Give me 5 topic ideas my child would enjoy",
];

export function StudioPage() {
  const threads = useApi<{ threads: ChatThread[] }>("/api/studio/threads");
  const kids = useApi<{ children: Child[] }>("/api/children");
  const [pickedThread, setThreadId] = useState<string | null>(null);
  const [pickedChild, setChildId] = useState<string | null>(null);
  const claudeOk = useClaudeOk();
  // Defaults: latest chat, first child ("" = nobody chosen on purpose).
  const threadId = pickedThread ?? threads.data?.threads[0]?.id ?? null;
  const childId = pickedChild ?? kids.data?.children[0]?.id ?? "";

  const newThread = async () => {
    const r = await api<{ thread: ChatThread }>("/api/studio/threads", { body: { title: "New idea" } });
    threads.reload();
    setThreadId(r.thread.id);
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <PageHeader
        emoji="🤖"
        title="AI Studio"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            Chat with Claude to create inspiration topics (kept apart from the books) — Claude also draws the pictures, in the style of the pictures you attach. <ClaudeStatusBadge compact />
          </span>
        }
        actions={
          <label className="flex items-center gap-2 font-bold">
            Match level of
            <select className={inputCls} value={childId} onChange={(e) => setChildId(e.target.value)}>
              <option value="">— nobody —</option>
              {kids.data?.children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.avatar} {c.name} ({c.age})
                </option>
              ))}
            </select>
          </label>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-2">
          <Button variant="grape" onClick={newThread}>
            + New chat
          </Button>
          <div className="flex gap-2 overflow-x-auto lg:flex-col">
            {threads.data?.threads.map((t) => (
              <div key={t.id} className={`group flex shrink-0 items-center rounded-xl ${t.id === threadId ? "bg-grape-soft" : "hover:bg-paper"}`}>
                <button onClick={() => setThreadId(t.id)} className="min-w-0 flex-1 truncate px-3 py-2 text-left font-bold">
                  💬 {t.title}
                </button>
                <button
                  aria-label="Delete chat"
                  className="px-2 text-ink-soft opacity-60 hover:opacity-100"
                  onClick={async () => {
                    if (!confirm("Delete this chat?")) return;
                    await api(`/api/studio/threads/${t.id}`, { method: "DELETE" });
                    if (t.id === threadId) setThreadId(null);
                    threads.reload();
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </aside>
        {threadId ? (
          <ChatView key={threadId} threadId={threadId} childId={childId} claudeOk={claudeOk} onActivity={threads.reload} />
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-3xl border-2 border-line bg-paper p-10">
            <Mascot say="Hi! What shall we make today?" />
            <Button variant="grape" onClick={newThread}>
              Start a chat
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** A file in the composer: being read by the server, ready to send, or refused (with the reason). */
type Attach = { key: string; name: string; kind: StudioFileKind; state: "uploading" | "ready" | "error"; file?: StudioFile; error?: string };
let attachSeq = 0;

function ChatView({ threadId, childId, claudeOk, onActivity }: { threadId: string; childId: string; claudeOk: boolean; onActivity: () => void }) {
  const { data, reload } = useApi<{ thread: ChatThread; messages: ChatMessage[] }>(`/api/studio/threads/${threadId}`);
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState<{ text: string; files: StudioFile[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [attach, setAttach] = useState<Attach[]>([]);
  const [dragging, setDragging] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dropped = useRef(new Set<string>());
  const filesUrl = `/api/studio/threads/${threadId}/files`;

  useEffect(() => {
    // Block body on purpose: newer browsers return a Promise from scrollIntoView, and an effect must not return it.
    void bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [data, streaming, pending]);

  const uploadOne = async (f: File, key: string, name: string) => {
    try {
      const fd = new FormData();
      fd.append("file", f, name);
      const res = await fetch(filesUrl, { method: "POST", body: fd });
      const d = (await res.json().catch(() => ({}))) as { file?: StudioFile; error?: string };
      if (!res.ok || !d.file) throw new Error(d.error ?? "The file could not be added.");
      const file = d.file;
      if (dropped.current.has(key)) {
        void api(`${filesUrl}/${file.id}`, { method: "DELETE" }).catch(() => {});
        return;
      }
      setAttach((list) => list.map((a) => (a.key === key ? { ...a, state: "ready", kind: file.kind, file } : a)));
    } catch (e) {
      setAttach((list) => list.map((a) => (a.key === key ? { ...a, state: "error", error: (e as Error).message } : a)));
    }
  };

  const addFiles = (list: File[]) => {
    if (!list.length) return;
    setErr(null);
    const room = MAX_FILES_PER_MESSAGE - attach.filter((a) => a.state !== "error").length;
    if (list.length > room) setErr(`You can attach up to ${MAX_FILES_PER_MESSAGE} files to one message.`);
    const added: Attach[] = [];
    for (const f of list.slice(0, Math.max(0, room))) {
      const key = `a${++attachSeq}`;
      const name = f.name || `picture-${attachSeq}.png`;
      const tooBig = f.size > MAX_FILE_MB * 1024 * 1024;
      added.push({ key, name, kind: kindFromName(name), state: tooBig ? "error" : "uploading", error: tooBig ? `Too big (max ${MAX_FILE_MB} MB).` : undefined });
      if (!tooBig) void uploadOne(f, key, name);
    }
    setAttach((a) => [...a, ...added]);
  };

  const removeAttach = (a: Attach) => {
    setAttach((list) => list.filter((x) => x.key !== a.key));
    if (a.file) void api(`${filesUrl}/${a.file.id}`, { method: "DELETE" }).catch(() => {});
    else if (a.state === "uploading") dropped.current.add(a.key);
  };

  const ready = attach.flatMap((a) => (a.state === "ready" && a.file ? [a.file] : []));
  const uploading = attach.some((a) => a.state === "uploading");
  const busy = streaming !== null;

  const send = async (msg: string) => {
    const typed = msg.trim();
    if (busy || uploading || !claudeOk || (!typed && !ready.length)) return;
    const sentAttach = attach;
    setErr(null);
    setText("");
    setAttach([]);
    setStatus(ready.length ? "📎 Claude is reading your files…" : null);
    setPending({ text: typed || FILE_ASK, files: ready });
    setStreaming("");
    const ac = new AbortController();
    abort.current = ac;
    let heard = false;
    try {
      await streamSSE(
        "/api/studio/chat",
        { threadId, message: typed, childId: childId || undefined, fileIds: ready.map((f) => f.id) },
        (ev, d) => {
          heard = true;
          if (ev === "delta") {
            setStatus(null);
            setStreaming((s) => (s ?? "") + (d as { text: string }).text);
          }
          if (ev === "status") {
            setStatus((d as { message: string }).message);
            setStreaming((s) => (s && !s.endsWith("\n\n") ? s + "\n\n" : s));
          }
          if (ev === "error") setErr((d as { message: string }).message);
        },
        ac.signal,
      );
    } catch (e) {
      if (!ac.signal.aborted) {
        setErr((e as Error).message);
        // Nothing reached the chat: give the text and files back so they can be sent again.
        if (!heard) {
          setAttach(sentAttach.filter((a) => a.state !== "error"));
          setText(typed);
        }
      }
    }
    setStreaming(null);
    setStatus(null);
    setPending(null);
    reload();
    onActivity();
  };

  const onDrag = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault(); // otherwise the browser opens the dropped file and leaves the app
    if (claudeOk && !busy) setDragging(true);
  };

  const messages = data?.messages ?? [];
  return (
    <div
      className="relative flex min-h-[70vh] flex-col rounded-3xl border-2 border-line bg-paper"
      onDragEnter={onDrag}
      onDragOver={onDrag}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(false);
        if (claudeOk && !busy) addFiles([...e.dataTransfer.files]);
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-3xl border-4 border-dashed border-grape bg-grape-soft/95 text-center">
          <span className="text-5xl">📎</span>
          <span className="text-2xl font-extrabold text-grape-deep">Drop the files here</span>
          <span className="font-bold">Pictures, PDF, Word, Excel, PowerPoint</span>
        </div>
      )}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {!messages.length && !pending && attach.length > 0 && (
          <div className="flex flex-col items-center gap-4 py-6">
            <Mascot say="Great! Tell me what to make from your files — or pick an idea below." />
          </div>
        )}
        {!messages.length && !pending && !attach.length && (
          <div className="flex flex-col items-center gap-4 py-6">
            <Mascot say="Tell me a topic your child loves!" />
            <div className="flex max-w-3xl flex-wrap justify-center gap-2">
              {CHIPS.map((c) => (
                <button key={c} disabled={!claudeOk} onClick={() => send(c)} className="rounded-full border-2 border-grape bg-grape-soft px-3 py-1 text-left font-bold disabled:opacity-50">
                  {c}
                </button>
              ))}
              <button disabled={!claudeOk} onClick={() => fileInput.current?.click()} className="rounded-full border-2 border-sky bg-sky-soft px-3 py-1 text-left font-bold disabled:opacity-50">
                📎 Turn my worksheet, photo, PDF or slides into a lesson
              </button>
            </div>
          </div>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} m={m} onFix={(why) => send(`The pack had these problems, please fix them and send the full pack again:\n${why}`)} />
        ))}
        {pending && <Bubble m={{ id: "p", threadId, role: "user", text: pending.text, pack: null, files: pending.files, createdAt: "" }} />}
        {streaming !== null && (
          <div className="max-w-3xl rounded-3xl rounded-bl-md bg-cream p-4">
            {streaming.replace(/```inspiration-pack[\s\S]*/, "").trim() ? <ChatText text={streaming.replace(/```inspiration-pack[\s\S]*/, "").trim()} /> : status ? null : "…"}
            {status && <p className="animate-pulse font-bold text-sky-deep">{status}</p>}
            {/```inspiration-pack/.test(streaming) && <p className="mt-2 font-bold text-grape-deep">✨ Building your topic pack…</p>}
          </div>
        )}
        {err && <p className="rounded-xl bg-berry-soft p-3 font-bold text-berry-deep">❌ {err}</p>}
        <div ref={bottom} />
      </div>
      <div className="border-t-2 border-line p-3">
        {attach.length > 0 && (
          <ul aria-label="Attached files" className="mb-2 flex flex-wrap gap-2">
            {attach.map((a) => (
              <li key={a.key}>
                <AttachChip a={a} threadId={threadId} onRemove={() => removeAttach(a)} />
              </li>
            ))}
          </ul>
        )}
        {ready.length > 0 && !uploading && !busy && (
          <div className="mb-2 flex flex-wrap gap-2">
            {FILE_CHIPS.map((c) => (
              <button key={c} type="button" onClick={() => send(c)} className="rounded-full border-2 border-grape bg-grape-soft px-3 py-1 text-sm font-bold">
                {c}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <Button
            type="button"
            className="px-3 text-xl"
            aria-label="Attach files"
            title="Attach pictures, PDF, Word, Excel or PowerPoint files"
            disabled={!claudeOk || busy}
            onClick={() => fileInput.current?.click()}
          >
            📎
          </Button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={STUDIO_ACCEPT}
            className="hidden"
            data-testid="studio-file"
            onChange={(e) => {
              const picked = [...(e.target.files ?? [])];
              e.target.value = "";
              addFiles(picked);
            }}
          />
          <textarea
            className={`${inputCls} flex-1 resize-none`}
            rows={2}
            value={text}
            placeholder={
              !claudeOk
                ? "Claude CLI is not connected (see Settings)."
                : attach.length
                  ? "Say what to make from the file(s) — or pick an idea above…"
                  : "e.g. Make a topic about space for my 7-year-old…"
            }
            disabled={!claudeOk}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              // Pasted screenshots / copied pictures become attachments.
              const pasted = [...e.clipboardData.files];
              if (!pasted.length || busy) return;
              e.preventDefault();
              addFiles(pasted);
            }}
            onKeyDown={(e) => {
              // Don't send while a Vietnamese/IME composition is still open.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(text);
              }
            }}
          />
          {busy ? (
            <Button type="button" onClick={() => abort.current?.abort()}>
              Stop
            </Button>
          ) : (
            <Button type="submit" variant="grape" disabled={(!text.trim() && !ready.length) || uploading || !claudeOk}>
              {uploading ? "Reading…" : "Send"}
            </Button>
          )}
        </form>
        <p className="mt-2 text-sm text-ink-soft">
          📎 Attach, drop or paste <b>pictures, PDF, Word, Excel or PowerPoint</b> files (up to {MAX_FILE_MB} MB each) — Claude reads them and designs the lesson from them. After you save a topic,
          Claude draws a picture for each word <b>in the style of the pictures you attached</b> (or a style that fits the topic).
        </p>
      </div>
    </div>
  );
}

function FileThumb({ file, kind, threadId, big = false }: { file?: StudioFile; kind: StudioFileKind; threadId: string; big?: boolean }) {
  const size = big ? "size-14" : "size-10";
  if (file?.thumb)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/api/studio/threads/${threadId}/files/${file.id}?f=thumb.jpg`} alt="" className={`${size} shrink-0 rounded-lg border border-line bg-white object-cover`} />
    );
  return <span className={`grid ${size} shrink-0 place-items-center rounded-lg bg-cream ${big ? "text-3xl" : "text-2xl"}`}>{FILE_KIND[kind].icon}</span>;
}

function AttachChip({ a, threadId, onRemove }: { a: Attach; threadId: string; onRemove: () => void }) {
  const bad = a.state === "error";
  return (
    <div className={`flex max-w-sm items-center gap-2 rounded-2xl border-2 p-1.5 ${bad ? "border-berry bg-berry-soft" : "border-line bg-white"}`}>
      <FileThumb file={a.file} kind={a.kind} threadId={threadId} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate font-bold" title={a.name}>
          {a.name}
        </p>
        {a.state === "uploading" && <p className="animate-pulse text-xs font-bold text-sky-deep">⏳ Reading the file…</p>}
        {a.state === "ready" && a.file && (
          <p className="truncate text-xs text-ink-soft" title={a.file.note ?? undefined}>
            ✅ {fileSummary(a.file)}
          </p>
        )}
        {bad && <p className="text-xs font-bold text-berry-deep">❌ {a.error}</p>}
      </div>
      <button type="button" aria-label={`Remove ${a.name}`} onClick={onRemove} className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-cream">
        ✕
      </button>
    </div>
  );
}

function FileCard({ file, threadId }: { file: StudioFile; threadId: string }) {
  return (
    <a
      href={`/api/studio/threads/${threadId}/files/${file.id}?f=source`}
      target="_blank"
      rel="noreferrer"
      title={file.note ?? `Open ${file.name}`}
      className="flex max-w-xs items-center gap-2 rounded-2xl border-2 border-line bg-white p-1.5 pr-3 hover:border-sky"
    >
      <FileThumb file={file} kind={file.kind} threadId={threadId} big />
      <span className="min-w-0 leading-tight">
        <span className="block truncate font-bold">{file.name}</span>
        <span className="block truncate text-xs text-ink-soft">{fileSummary(file)}</span>
      </span>
    </a>
  );
}

/** **bold**, *italic* / _italic_, `code` inside a line — built as React elements (no HTML from the AI is ever inserted). */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*?\*|_[^_\n]+_|`[^`\n]+`)/g).map((p, k) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <b key={k}>{p.slice(2, -2)}</b>;
    if (/^\*[^*].*\*$/.test(p) || /^_[^_]+_$/.test(p)) return <i key={k}>{p.slice(1, -1)}</i>;
    if (/^`[^`]+`$/.test(p)) return <code key={k} className="rounded bg-white/70 px-1">{p.slice(1, -1)}</code>;
    return p;
  });
}

/** Claude answers in simple Markdown: headings, lists and emphasis are shown nicely instead of as * and #. */
export function ChatText({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  return (
    <div className="space-y-1 break-words">
      {lines.map((line, k) => {
        if (!line.trim()) return <div key={k} className="h-2" />;
        const h = /^#{1,4}\s+(.*)$/.exec(line);
        if (h) return <p key={k} className="pt-1 font-extrabold">{inline(h[1])}</p>;
        const li = /^(\s*)(?:[-*•]|(\d+)[.)])\s+(.*)$/.exec(line);
        if (li)
          return (
            <div key={k} className="flex gap-2" style={{ paddingLeft: `${Math.min(3, Math.floor(li[1].length / 2)) * 1.25}rem` }}>
              <span className="shrink-0 font-bold">{li[2] ? `${li[2]}.` : "•"}</span>
              <span className="min-w-0">{inline(li[3])}</span>
            </div>
          );
        return <p key={k}>{inline(line)}</p>;
      })}
    </div>
  );
}

function Bubble({ m, onFix }: { m: ChatMessage; onFix?: (why: string) => void }) {
  if (m.role === "user")
    return (
      <div className="ml-auto flex max-w-2xl flex-col items-end gap-2">
        {m.files?.length ? (
          <div className="flex flex-wrap justify-end gap-2">
            {m.files.map((f) => (
              <FileCard key={f.id} file={f} threadId={m.threadId} />
            ))}
          </div>
        ) : null}
        <div className="rounded-3xl rounded-br-md bg-sun-soft p-4 whitespace-pre-wrap">{m.text}</div>
      </div>
    );
  if (m.role === "error")
    return (
      <div className="max-w-3xl rounded-2xl bg-berry-soft p-3">
        <b>❌ {m.text}</b>
      </div>
    );
  return (
    <div className="max-w-3xl space-y-3">
      <div className="rounded-3xl rounded-bl-md bg-cream p-4">
        <ChatText text={m.text} />
      </div>
      {m.pack ? <PackCard pack={m.pack as InspirationPack} threadId={m.threadId} /> : /inspiration-pack/.test(m.text) && onFix ? <Button onClick={() => onFix("The JSON block could not be read.")}>Ask Claude to fix it</Button> : null}
    </div>
  );
}

function PackCard({ pack, threadId }: { pack: InspirationPack; threadId: string }) {
  const [saved, setSaved] = useState<string | null>(null);
  const [pictures, setPictures] = useState(false);
  const [styleCount, setStyleCount] = useState(0);
  const [added, setAdded] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="rounded-3xl border-2 border-grape bg-grape-soft p-4">
      <div className="flex items-center gap-3">
        <span className="text-5xl">{pack.topic.emoji}</span>
        <div>
          <p className="text-xl font-extrabold">{pack.topic.title}</p>
          <p className="text-sm">{pack.topic.description}</p>
          <Badge tone="gray">{STAGE_LABEL[pack.topic.stage]}</Badge>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {pack.items.map((it, k) => (
          <li key={k} className={`rounded-full px-3 py-1 text-sm font-bold ${TYPE_META[it.type].soft}`}>
            {TYPE_META[it.type].icon} {it.title}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {saved ? (
          <span className="flex flex-col gap-1">
            <Link href={`/parent/inspiration/${saved}`} className="font-bold underline">
              ✅ Saved as draft — open to review & approve →
            </Link>
            {pictures && (
              <span className="text-sm">
                🎨 Claude is now drawing a picture for every word
                {styleCount ? ` in the style of your ${styleCount === 1 ? "picture" : `${styleCount} pictures`}` : " in a style that fits the topic"} — see them on the topic page.
              </span>
            )}
            {added.length > 0 && <span className="text-sm">🎮 Two games per topic: added {added.join(", ")}.</span>}
            <span className="text-sm text-ink-soft">
              Then give it to a child in{" "}
              <Link href="/parent/children" className="font-bold underline">
                Children → Edit
              </Link>
              .
            </span>
          </span>
        ) : (
          <Button
            variant="grape"
            onClick={async () => {
              try {
                const r = await api<{ topic: { id: string }; pictures: boolean; stylePictures: number; addedGames: string[] }>("/api/topics", { body: { pack, threadId } });
                setPictures(r.pictures);
                setStyleCount(r.stylePictures);
                setAdded(r.addedGames);
                setSaved(r.topic.id);
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
          >
            💾 Save as draft topic
          </Button>
        )}
        {err && <span className="text-berry-deep">{err}</span>}
      </div>
    </div>
  );
}

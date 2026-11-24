"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, useApi } from "@/lib/client/api";
import { Badge, Button, EmptyState, LinkButton, PageHeader, Panel, ProgressBar } from "@/components/ui";
import { ErrorBox, Loading } from "@/components/kids";
import { creditText, type PictureCredit } from "@/lib/topicPictures";
import { STAGE_LABEL } from "@/lib/contentMeta";
import type { ContentItem, InspirationTopic } from "@/lib/types";
import { ItemList } from "./items";
import { HomeOnly } from "@/components/online";
import { ONLINE } from "@/lib/mode";

export function InspirationPage() {
  const { data, error, reload } = useApi<{ topics: InspirationTopic[] }>("/api/topics");
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        emoji="✨"
        title="Inspiration topics"
        subtitle="Extra topics you create with Claude — kept separate from the books. To give a topic to a child: approve it, then tick it in Children → Edit. It shows as a “Bonus island” for that child."
        actions={
          <HomeOnly>
            <LinkButton href="/parent/studio" variant="grape">
              🤖 New topic in AI Studio
            </LinkButton>
          </HomeOnly>
        }
      />
      {!data ? (
        <Loading />
      ) : !data.topics.length ? (
        <EmptyState emoji="🦖" title="No inspiration topics yet">
          {ONLINE ? (
            <>Topics are made in AI Studio on your home computer, then published here.</>
          ) : (
            <>
              Open <b>AI Studio</b> and ask: “Make a topic about dinosaurs for my 6-year-old.”
            </>
          )}
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.topics.map((t) => (
            <Link key={t.id} href={`/parent/inspiration/${t.id}`} className="flex flex-col gap-2 rounded-3xl border-2 border-grape bg-grape-soft p-5 shadow-[0_4px_0_0_#d7c4f2] hover:border-grape-deep">
              <span className="text-5xl">{t.emoji}</span>
              <h2 className="text-xl font-extrabold">{t.title}</h2>
              <p className="text-sm text-ink-soft">{t.description}</p>
              <span className="flex flex-wrap gap-2">
                <Badge tone={t.status === "approved" ? "grass" : "orange"}>{t.status === "approved" ? "Live" : "Draft"}</Badge>
                <Badge tone="gray">{STAGE_LABEL[t.stage]}</Badge>
                <Badge tone="grape">
                  {t.itemCount} {t.itemCount === 1 ? "item" : "items"}
                </Badge>
              </span>
              <ForChildren topic={t} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

type PictureView = {
  mode: "web" | "draw" | "off";
  job: { running: boolean; msg: string; progress: number; error?: string } | null;
  style: { refs: { file: string; url: string }[]; summary: string | null; from: "pictures" | "topic" | null; outdated: boolean };
  words: {
    key: string;
    word: string;
    emoji: string;
    picture: { url: string; source: "web" | "ai"; credit: PictureCredit | null; file: string } | null;
    candidates: { n: number; file: string; url: string; credit: PictureCredit }[];
    drawn: boolean;
  }[];
};

/** The parent's style pictures (from the chat, or added here) and the style Claude draws in. */
function StyleBox({ topicId, data, disabled, onChange, onError }: { topicId: string; data: PictureView; disabled: boolean; onChange: (v: PictureView) => void; onError: (msg: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const s = data.style;
  const upload = async (file: File | undefined) => {
    if (!file) return;
    onError(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/topics/${topicId}/style`, { method: "POST", body: form });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as { error?: string }).error ?? "The picture could not be added.");
      onChange(d as PictureView);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (file: string) => {
    onError(null);
    try {
      onChange(await api<PictureView>(`/api/topics/${topicId}/style`, { method: "DELETE", body: { file } }));
    } catch (e) {
      onError((e as Error).message);
    }
  };
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-2xl border-2 border-grape bg-grape-soft/60 p-3" data-testid="picture-style">
      <div className="flex flex-wrap items-center gap-3">
        <b>🎨 Picture style</b>
        {s.refs.map((r) => (
          <span key={r.file} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.url} alt="Style picture" className="h-16 w-16 rounded-xl border-2 border-ink bg-white object-cover" />
            <button
              type="button"
              aria-label={`Remove style picture ${r.file}`}
              disabled={disabled}
              onClick={() => remove(r.file)}
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink bg-paper text-xs font-bold disabled:opacity-40"
            >
              ✕
            </button>
          </span>
        ))}
        {s.refs.length < 4 && (
          <label className={`inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-xl border-2 border-dashed border-grape-deep bg-paper px-3 text-sm font-bold ${disabled || busy ? "pointer-events-none opacity-50" : "hover:bg-grape-soft"}`}>
            {busy ? "⏳ Adding…" : "➕ Add a style picture"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={disabled || busy}
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      <p className="text-sm text-ink-soft">
        {s.summary
          ? `${s.from === "pictures" ? "Claude's style from your pictures" : "Style Claude chose for this topic"}: ${s.summary}`
          : s.refs.length
            ? "Claude will draw the pictures in the style of these pictures."
            : "No style pictures — Claude picks a style that fits the topic. Add a picture (a drawing or a page your child likes) and Claude draws in its style."}
      </p>
      {s.outdated && <p className="text-sm font-bold text-orange-deep">The style pictures changed — press “🎨 Draw all again” so the drawings use them.</p>}
    </div>
  );
}

/** The topic's pictures: drawn by Claude in the topic's style (or picked from the web); the parent can change each. */
function TopicPicturesPanel({ topicId }: { topicId: string }) {
  const { data, error, reload, setData } = useApi<PictureView>(`/api/topics/${topicId}/pictures`);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const running = !!data?.job?.running;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(reload, 2000);
    return () => clearInterval(t);
  }, [running, reload]);
  const act = async (body: Record<string, unknown>) => {
    setErr(null);
    try {
      setData(await api<PictureView>(`/api/topics/${topicId}/pictures`, { body }));
      setOpen(null); // done choosing: close the picture strip
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  if (!data.words.length) return null;
  const found = data.words.filter((w) => w.picture).length;
  return (
    <Panel
      title={`🖼️ Pictures (${found}/${data.words.length})`}
      actions={
        <Button variant="grape" disabled={running || data.mode === "off"} onClick={() => act({ action: "find" })}>
          {data.mode === "web" ? "🔎 Find pictures again" : "🎨 Draw all again"}
        </Button>
      }
    >
      <p className="mb-3 text-sm text-ink-soft">
        {data.mode === "off"
          ? "Pictures are switched off in Settings — the words show their emoji."
          : data.mode === "draw"
            ? "Claude draws a picture for every word in the topic's style, checks them and redraws weak ones (nothing is searched on the web). Change it in Settings."
            : "Claude picks openly licensed pictures from the web (Openverse) and draws the rest in the topic's style. Only the words are searched — nothing about your family."}
      </p>
      {data.mode !== "off" && <StyleBox topicId={topicId} data={data} disabled={running} onChange={setData} onError={setErr} />}
      {running && (
        <div className="mb-4 rounded-2xl border-2 border-grape bg-grape-soft p-3" role="status">
          <p className="font-bold">{data.job!.msg}</p>
          <ProgressBar value={data.job!.progress} tone="bg-grape" />
        </div>
      )}
      {data.job?.error && !running && <p className="mb-3 font-bold text-berry-deep">{data.job.error}</p>}
      {err && <p className="mb-3 font-bold text-berry-deep">{err}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.words.map((w) => (
          <div key={w.key} className="flex flex-col gap-2 rounded-2xl border-2 border-line bg-cream p-3" data-testid={`picture-${w.key}`}>
            <div className="flex items-center gap-3">
              {w.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={w.picture.url} alt={w.word} className="h-20 w-20 shrink-0 rounded-xl border-2 border-ink bg-white object-contain" />
              ) : (
                <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-line bg-white text-5xl">{w.emoji}</span>
              )}
              <div className="min-w-0">
                <p className="text-lg font-extrabold">{w.word}</p>
                <p className="text-xs text-ink-soft">
                  {w.picture?.source === "web" && w.picture.credit ? (
                    <>
                      🌐{" "}
                      <a href={w.picture.credit.url} target="_blank" rel="noreferrer" className="underline">
                        {creditText(w.picture.credit)}
                      </a>
                    </>
                  ) : w.picture?.source === "ai" ? (
                    "🎨 Drawn by Claude"
                  ) : (
                    "😀 Emoji"
                  )}
                </p>
              </div>
            </div>
            <Button className="!min-h-9 !py-1 text-sm" disabled={running} onClick={() => setOpen(open === w.key ? null : w.key)}>
              {open === w.key ? "Close" : "Change picture"}
            </Button>
            {open === w.key && (
              <div className="flex flex-wrap gap-2" aria-label={`Pictures for ${w.word}`}>
                {w.candidates.map((c) => (
                  <button
                    key={c.file}
                    title={creditText(c.credit)}
                    aria-label={`Use web picture ${c.n} for ${w.word}`}
                    onClick={() => act({ action: "choose", key: w.key, file: c.file })}
                    className={`h-14 w-14 overflow-hidden rounded-lg border-2 bg-white ${w.picture?.file === c.file ? "border-grape-deep ring-2 ring-grape" : "border-line"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
                {w.drawn && w.picture?.file !== "ai.png" && (
                  <Button className="!min-h-9 !py-1 text-sm" onClick={() => act({ action: "choose", key: w.key, file: "ai.png" })}>
                    🎨 Use the drawing
                  </Button>
                )}
                <Button className="!min-h-9 !py-1 text-sm" onClick={() => act({ action: "draw", key: w.key })}>
                  🎨 Claude, draw it
                </Button>
                {w.picture && (
                  <Button className="!min-h-9 !py-1 text-sm" onClick={() => act({ action: "choose", key: w.key, file: null })}>
                    {w.emoji} Use the emoji
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** Who gets this topic (it is given per child in Children → Edit). */
function ForChildren({ topic }: { topic: InspirationTopic }) {
  const kids = topic.children ?? [];
  if (!kids.length) return <p className="text-sm font-bold text-orange-deep">Not given to any child yet</p>;
  return (
    <p className="text-sm font-bold">
      For: {kids.map((c) => `${c.avatar} ${c.name}`).join(", ")}
    </p>
  );
}

export function TopicDetail({ topicId }: { topicId: string }) {
  const { data, error, reload } = useApi<{ topic: InspirationTopic; items: ContentItem[] }>(`/api/topics/${topicId}`);
  const router = useRouter();
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const { topic, items } = data;
  const setStatus = async (status: "approved" | "draft") => {
    await api(`/api/topics/${topicId}`, { method: "PATCH", body: { status } });
    reload();
  };
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <p className="text-sm font-bold text-ink-soft">
        <Link href="/parent/inspiration" className="underline">
          Inspiration
        </Link>{" "}
        › {topic.title}
      </p>
      <PageHeader
        emoji={topic.emoji}
        title={topic.title}
        subtitle={
          <span className="flex flex-wrap gap-2">
            <Badge tone="grape">✨ Inspiration</Badge>
            <Badge tone={topic.status === "approved" ? "grass" : "orange"}>{topic.status === "approved" ? "Live" : "Draft"}</Badge>
            <Badge tone="gray">{STAGE_LABEL[topic.stage]}</Badge>
          </span>
        }
        actions={
          <HomeOnly>
            {topic.status === "draft" ? (
              <Button variant="grass" onClick={() => setStatus("approved")}>
                ✅ Approve topic (all items)
              </Button>
            ) : (
              <Button onClick={() => setStatus("draft")}>Hide from children</Button>
            )}
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirm("Delete this topic and its items?")) return;
                await api(`/api/topics/${topicId}`, { method: "DELETE" });
                router.push("/parent/inspiration");
              }}
            >
              Delete
            </Button>
          </HomeOnly>
        }
      />
      {topic.description && <p>{topic.description}</p>}
      <Panel title="👧 Children">
        <ForChildren topic={topic} />
        <p className="mt-2 text-sm text-ink-soft">
          To give this topic to a child (or take it away), open{" "}
          <Link href="/parent/children" className="font-bold underline">
            Children
          </Link>{" "}
          → <b>Edit</b> → tick it under <b>Extra topics</b>.{topic.status === "draft" && " Children see it after you approve it."}
        </p>
      </Panel>
      {/* Pictures are drawn / chosen in the app at home (the online version shows them in the lessons). */}
      <HomeOnly>
        <TopicPicturesPanel topicId={topicId} />
      </HomeOnly>
      <Panel title="🎒 Items">
        <ItemList items={items} onChange={reload} />
      </Panel>
    </div>
  );
}

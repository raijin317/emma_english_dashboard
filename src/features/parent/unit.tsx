"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { api, streamSSE, useApi } from "@/lib/client/api";
import { Badge, Button, PageHeader, Panel, inputCls } from "@/components/ui";
import { ErrorBox, Loading, SpeakButton } from "@/components/kids";
import { TYPE_META } from "@/lib/contentMeta";
import { CONTENT_TYPES, type Book, type ContentItem, type ContentType, type Unit } from "@/lib/types";
import type { UnitExtract } from "@/lib/schemas/book";
import { ItemList } from "./items";
import { JobLog, PageModal } from "./books";
import { useClaudeOk, useJob } from "./common";
import { PicturePicker } from "./picker";
import { RulesNote } from "./rules";
import { cropUrl } from "@/lib/pictures";
import { bookTexts } from "@/lib/bookText";
import { HomeOnly } from "@/components/online";
import { ONLINE } from "@/lib/mode";

type UnitData = { unit: Unit; book: Book; items: ContentItem[]; siblings: { id: string; order: number; title: string }[] };

export function UnitWorkspace({ unitId }: { unitId: string }) {
  const { data, error, reload } = useApi<UnitData>(`/api/units/${unitId}`);
  const [pickedTab, setTab] = useState<"book" | "practice" | null>(null);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const { unit, book, items, siblings } = data;
  const tab = pickedTab ?? (unit.status === "approved" ? "practice" : "book");
  const idx = siblings.findIndex((s) => s.id === unit.id);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <p className="text-sm font-bold text-ink-soft">
        <Link href="/parent/books" className="underline">
          Books
        </Link>{" "}
        ›{" "}
        <Link href={`/parent/books/${book.id}`} className="underline">
          {book.title}
        </Link>{" "}
        › Unit {unit.order}
      </p>
      <PageHeader
        title={`Unit ${unit.order}: ${unit.title}`}
        subtitle={
          <span className="flex flex-wrap gap-2">
            <Badge tone={unit.status === "approved" ? "grass" : "orange"}>{unit.status === "approved" ? "Approved" : "Needs your review"}</Badge>
            {unit.topic && <Badge tone="gray">{unit.topic}</Badge>}
          </span>
        }
        actions={
          <>
            {idx > 0 && <Link className="btn-3d rounded-2xl border-2 border-line bg-paper px-3 py-2 font-bold" href={`/parent/units/${siblings[idx - 1].id}`}>◀ Unit {siblings[idx - 1].order}</Link>}
            {idx < siblings.length - 1 && <Link className="btn-3d rounded-2xl border-2 border-line bg-paper px-3 py-2 font-bold" href={`/parent/units/${siblings[idx + 1].id}`}>Unit {siblings[idx + 1].order} ▶</Link>}
          </>
        }
      />
      <div className="flex gap-2" role="tablist">
        {(
          [
            ["book", "📖 From the book"],
            ["practice", `🎒 Practice pack (${items.length})`],
          ] as const
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-2xl px-4 py-2 font-bold ${tab === k ? "bg-sun" : "bg-paper text-ink-soft"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "book" ? <ExtractEditor data={data} onSaved={reload} /> : <PracticePanel data={data} onChange={reload} />}
    </div>
  );
}

/* ------------------------- What the book teaches ------------------------- */

function ExtractEditor({ data, onSaved }: { data: UnitData; onSaved: () => void }) {
  const { unit, book } = data;
  const [ex, setEx] = useState<UnitExtract>(unit.extract);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [page, setPage] = useState<number | null>(null);
  const [picking, setPicking] = useState<number | null>(null);
  const upd = (f: (e: UnitExtract) => UnitExtract) => {
    setEx(f(structuredClone(ex)));
    setDirty(true);
  };

  const save = async (status?: "approved") => {
    setMsg(null);
    try {
      const clean: UnitExtract = { ...ex, sentences: ex.sentences.map((s) => s.trim()).filter(Boolean), readings: ex.readings.filter((r) => r.text.trim()) };
      await api(`/api/units/${unit.id}`, { method: "PATCH", body: { extract: clean, ...(status ? { status } : {}) } });
      setDirty(false);
      setMsg(status ? "Approved! Now make a practice pack." : "Saved.");
      onSaved();
    } catch (e) {
      const err = e as Error & { details?: string };
      setMsg(`${err.message} ${err.details ?? ""}`);
    }
  };

  // Online the book pages are not published (only the word pictures), and the unit is read-only.
  const pages = book.isDemo || ONLINE ? [] : Array.from({ length: unit.pages[1] - unit.pages[0] + 1 }, (_, k) => unit.pages[0] + k);

  return (
    <fieldset disabled={ONLINE} className="flex min-w-0 flex-col gap-6">
      {unit.status !== "approved" && (
        <div className="rounded-2xl bg-orange-soft p-4">
          <b>Please check what Claude read from the book.</b> Fix any wrong words or emoji, then approve. Only approved units are used for your child.
          {ex.confidence < 0.6 && <p className="mt-1">⚠️ Claude was not very sure about these pages.</p>}
          {ex.notes && <p className="mt-1">📝 {ex.notes}</p>}
        </div>
      )}
      {pages.length > 0 && (
        <Panel title="📄 Book pages">
          <div className="flex gap-2 overflow-x-auto">
            {pages.map((p) => (
              <button key={p} onClick={() => setPage(p)} className="w-24 shrink-0 rounded-lg border-2 border-line hover:border-sun">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/books/${book.id}/pages/${p}?thumb=1`} alt={`Page ${p}`} className="w-full rounded-md" />
                <span className="text-xs">p. {p}</span>
              </button>
            ))}
          </div>
        </Panel>
      )}
      {page && <PageModal bookId={book.id} page={page} max={book.pageCount} onClose={() => setPage(null)} onGo={setPage} />}

      {picking !== null && ex.vocabulary[picking] && (
        <PicturePicker
          bookId={book.id}
          word={ex.vocabulary[picking].word || "this word"}
          pages={pages}
          maxPage={book.pageCount}
          initial={ex.vocabulary[picking].pic}
          onClose={() => setPicking(null)}
          onPick={(pic) => {
            const k = picking;
            upd((x) => {
              if (pic) x.vocabulary[k].pic = pic;
              else delete x.vocabulary[k].pic;
              return x;
            });
            setPicking(null);
          }}
        />
      )}
      <Panel title={`🃏 Words (${ex.vocabulary.length})`} actions={<Button onClick={() => upd((e) => (e.vocabulary.push({ word: "", emoji: "⭐" }), e))}>+ Add word</Button>}>
        {pages.length > 0 && (
          <p className="mb-2 text-sm text-ink-soft">
            The child sees the <b>book&apos;s own picture</b> of each word. Click a picture (or 📷) to choose it on the page; the emoji is used only when there is no book picture.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead className="text-sm text-ink-soft">
              <tr>
                <th className="p-1">Book picture</th>
                <th className="p-1">Emoji</th>
                <th className="p-1">Word</th>
                <th className="p-1">Vietnamese (for you)</th>
                <th className="p-1" />
              </tr>
            </thead>
            <tbody>
              {ex.vocabulary.map((v, k) => (
                <tr key={k} className="border-t border-line">
                  <td className="p-1">
                    {pages.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setPicking(k)}
                        aria-label={`Choose the book picture for ${v.word || "this word"}`}
                        className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-line bg-paper text-2xl hover:border-sun"
                      >
                        {v.pic ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cropUrl(book.id, v.pic, 160)} alt={v.word} className="h-full w-full object-contain" />
                        ) : (
                          "📷"
                        )}
                      </button>
                    ) : v.pic && !book.isDemo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cropUrl(book.id, v.pic, 160)} alt={v.word} className="h-16 w-16 rounded-xl border-2 border-line bg-white object-contain" />
                    ) : (
                      <span className="text-sm text-ink-soft">—</span>
                    )}
                  </td>
                  <td className="p-1">
                    <input aria-label="Emoji" className={`${inputCls} w-20 text-center text-2xl`} value={v.emoji ?? ""} onChange={(e) => upd((x) => ((x.vocabulary[k].emoji = e.target.value), x))} />
                  </td>
                  <td className="p-1">
                    <input aria-label="Word" className={`${inputCls} w-full font-bold`} value={v.word} onChange={(e) => upd((x) => ((x.vocabulary[k].word = e.target.value), x))} />
                  </td>
                  <td className="p-1">
                    <input aria-label="Vietnamese meaning" className={`${inputCls} w-full`} value={v.vi ?? ""} onChange={(e) => upd((x) => ((x.vocabulary[k].vi = e.target.value), x))} />
                  </td>
                  <td className="flex gap-1 p-1">
                    {v.word && <SpeakButton text={v.word} size={40} />}
                    <Button variant="danger" aria-label="Remove word" onClick={() => upd((x) => (x.vocabulary.splice(k, 1), x))}>
                      ✕
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={`🧩 Sentence patterns (${ex.patterns.length})`} actions={<Button onClick={() => upd((e) => (e.patterns.push({ text: "", function: "" }), e))}>+ Add pattern</Button>}>
        <p className="mb-2 text-sm text-ink-soft">Write the part that changes as ___ (e.g. “I have a ___.”).</p>
        <div className="flex flex-col gap-2">
          {ex.patterns.map((p, k) => (
            <div key={k} className="flex flex-wrap gap-2">
              <input aria-label="Pattern" className={`${inputCls} min-w-60 flex-1 font-bold`} value={p.text} onChange={(e) => upd((x) => ((x.patterns[k].text = e.target.value), x))} />
              <input aria-label="Used for" placeholder="used for…" className={`${inputCls} w-56`} value={p.function} onChange={(e) => upd((x) => ((x.patterns[k].function = e.target.value), x))} />
              <Button variant="danger" aria-label="Remove pattern" onClick={() => upd((x) => (x.patterns.splice(k, 1), x))}>
                ✕
              </Button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={`💬 Sentences from the book (${ex.sentences.length})`} actions={<Button onClick={() => upd((e) => (e.sentences.push(""), e))}>+ Add sentence</Button>}>
        <p className="mb-2 text-sm text-ink-soft">Used for examples, listening and speaking — exactly as printed in the book.</p>
        <div className="flex flex-col gap-2">
          {ex.sentences.map((s, k) => (
            <div key={k} className="flex gap-2">
              <input aria-label={`Sentence ${k + 1}`} className={`${inputCls} flex-1`} value={s} onChange={(e) => upd((x) => ((x.sentences[k] = e.target.value), x))} />
              {s.trim() && <SpeakButton text={s} size={44} />}
              <Button variant="danger" aria-label="Remove sentence" onClick={() => upd((x) => (x.sentences.splice(k, 1), x))}>
                ✕
              </Button>
            </div>
          ))}
          {!ex.sentences.length && <p className="text-ink-soft">—</p>}
        </div>
      </Panel>

      <Panel title={`📖 Reading texts from the book (${ex.readings.length})`} actions={<Button onClick={() => upd((e) => (e.readings.push({ title: "", text: "" }), e))}>+ Add text</Button>}>
        <p className="mb-2 text-sm text-ink-soft">The Reading lesson shows these texts word for word. One line per line in the book; “Name: …” for dialogues.</p>
        <div className="flex flex-col gap-3">
          {ex.readings.map((r, k) => (
            <div key={k} className="flex flex-col gap-2 rounded-2xl border-2 border-line p-3">
              <div className="flex gap-2">
                <input aria-label={`Text ${k + 1} title`} placeholder="Title (e.g. Let's talk)" className={`${inputCls} flex-1 font-bold`} value={r.title} onChange={(e) => upd((x) => ((x.readings[k].title = e.target.value), x))} />
                {r.text.trim() && <SpeakButton text={r.text} size={44} />}
                <Button variant="danger" aria-label="Remove text" onClick={() => upd((x) => (x.readings.splice(k, 1), x))}>
                  ✕
                </Button>
              </div>
              <textarea aria-label={`Text ${k + 1}`} className={`${inputCls} w-full`} rows={Math.max(3, r.text.split("\n").length + 1)} value={r.text} onChange={(e) => upd((x) => ((x.readings[k].text = e.target.value), x))} />
            </div>
          ))}
          {!ex.readings.length && <p className="text-ink-soft">No reading text in this unit.</p>}
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-3">
        <Panel title="🔤 Phonics">{ex.phonics.length ? ex.phonics.map((p) => <p key={p.focus}><b>{p.focus}</b>: {p.examples.join(", ")}</p>) : <p className="text-ink-soft">—</p>}</Panel>
        <Panel title="🎵 Songs & chants">{ex.songsChants.length ? ex.songsChants.map((s) => <p key={s.title}>{s.title}</p>) : <p className="text-ink-soft">—</p>}</Panel>
        <Panel title="🛠️ Skills">
          <p>{ex.skills.join(", ") || "—"}</p>
          <p className="text-sm text-ink-soft">{ex.activityTypes.join(" · ")}</p>
        </Panel>
      </div>

      <HomeOnly>
        <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-line bg-paper p-3 shadow-lg">
          <Button variant="primary" disabled={!dirty} onClick={() => save()}>
            💾 Save
          </Button>
          {unit.status !== "approved" && (
            <Button variant="grass" onClick={() => save("approved")} disabled={ex.vocabulary.filter((v) => v.word.trim()).length < 1}>
              ✅ Looks good — approve unit
            </Button>
          )}
          {msg && <span className="font-bold">{msg}</span>}
        </div>
      </HomeOnly>
    </fieldset>
  );
}

/* ------------------------------ Practice pack ------------------------------ */

function PracticePanel({ data, onChange }: { data: UnitData; onChange: () => void }) {
  const { unit, book, items } = data;
  const claudeOk = useClaudeOk();
  const profile = book.assessment?.generationProfile;
  const available = CONTENT_TYPES.filter((t) => !(t === "reading" && profile && profile.readingPassageWords[1] === 0 && !bookTexts(unit.extract).length));
  const [types, setTypes] = useState<ContentType[]>(available.filter((t) => !items.some((i) => i.type === t)).length ? available.filter((t) => !items.some((i) => i.type === t)) : available);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState<null | "claude" | "quick">(null);
  const [status, setStatus] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const remake = useJob(onChange);

  if (unit.status !== "approved")
    return (
      <Panel>
        <p className="text-lg">
          First check and <b>approve the unit</b> in the “📖 From the book” tab. Then you can make practice from it.
        </p>
      </Panel>
    );

  const generate = async () => {
    const ac = new AbortController();
    ctrl.current = ac;
    setBusy("claude");
    setStatus("Asking Claude…");
    try {
      await streamSSE(
        `/api/units/${unit.id}/generate`,
        { types, extra },
        (ev, d) => {
          const x = d as { chars?: number; created?: number; message?: string; details?: string };
          if (ev === "progress") setStatus(`Claude is writing… (${x.chars} characters)`);
          if (ev === "status") setStatus(x.message ?? null);
          if (ev === "done") setStatus(`✅ ${x.created} new draft item(s). Review them below.`);
          if (ev === "error") setStatus(`❌ ${x.message}${x.details ? "\n" + x.details : ""}`);
        },
        ac.signal,
      );
    } catch (e) {
      setStatus(`❌ ${(e as Error).message}`);
    }
    setBusy(null);
    onChange();
  };

  const quick = async () => {
    setBusy("quick");
    try {
      const r = await api<{ created: number }>(`/api/units/${unit.id}/quick-pack`, { method: "POST" });
      setStatus(`⚡ ${r.created} draft item(s) made from the unit's words (no AI).`);
    } catch (e) {
      setStatus(`❌ ${(e as Error).message}`);
    }
    setBusy(null);
    onChange();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Making lessons (Claude or the offline builder) is done in the app at home. */}
      <HomeOnly>
        <Panel title="🎒 This unit's lessons">
          <p className="text-ink-soft">
            Lessons are made automatically when the book is added. Changed the words, sentences or rules? Remake the whole set for this unit. To change one lesson, open it below (✏️ Edit).
          </p>
          <div className="mt-1">
            <RulesNote />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="grape"
              disabled={remake.running || !!busy}
              onClick={() => confirm("Replace all lessons of this unit with a new set?") && remake.run(`/api/units/${unit.id}/resources`, {})}
            >
              {remake.running ? "Making lessons…" : items.length ? "♻️ Remake this unit's lessons" : "✨ Make this unit's lessons"}
            </Button>
          </div>
          <JobLog job={remake} />
        </Panel>
        <Panel title="➕ Add extra practice">
          <p className="mb-2 text-sm text-ink-soft">Adds new items as drafts (the current lessons stay).</p>
          <p className="mb-3 text-ink-soft">
            Uses only this unit’s words and patterns (plus earlier units for review), at the book’s level{book.assessment ? ` (ages ${book.assessment.estimatedAge.min}–${book.assessment.estimatedAge.max})` : ""}.
          </p>
          <div className="flex flex-wrap gap-2">
            {available.map((t) => {
              const on = types.includes(t);
              return (
                <button
                  key={t}
                  aria-pressed={on}
                  onClick={() => setTypes(on ? types.filter((x) => x !== t) : [...types, t])}
                  className={`rounded-full border-2 px-3 py-1 font-bold ${on ? `${TYPE_META[t].soft} border-ink` : "border-line bg-paper text-ink-soft"}`}
                >
                  {TYPE_META[t].icon} {TYPE_META[t].label}
                </button>
              );
            })}
          </div>
          <textarea className={`${inputCls} mt-3 w-full`} rows={2} placeholder="Optional: e.g. “My son loves cars — use cars in the examples”, “make it easier”" value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={500} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="grape" disabled={!!busy || !types.length || !claudeOk} onClick={generate}>
              {busy === "claude" ? "Claude is working…" : "🤖 Generate with Claude"}
            </Button>
            {busy === "claude" && <Button onClick={() => ctrl.current?.abort()}>Cancel</Button>}
            <Button variant="sun" disabled={!!busy} onClick={quick} title="Flashcards, listening, speaking, quiz, games, worksheet, lesson plan and test from the word list — no AI needed">
              ⚡ Quick pack (no AI)
            </Button>
            {!claudeOk && <span className="text-sm text-ink-soft">Claude CLI not connected — the quick pack still works.</span>}
          </div>
          {status && <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-cream p-3 font-sans">{status}</pre>}
        </Panel>
      </HomeOnly>
      <Panel title="🎒 Practice items">
        <ItemList items={items} onChange={onChange} />
      </Panel>
    </div>
  );
}

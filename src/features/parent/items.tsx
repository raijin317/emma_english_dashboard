"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { api, useApi } from "@/lib/client/api";
import { validateItemData, type GameKind } from "@/lib/schemas/content";
import { GAMES } from "@/lib/games";
import type { PictureMap } from "@/lib/pictures";
import { ContentForm } from "./editor";
import { PicturesProvider } from "@/components/Pic";
import { Badge, Button, LinkButton, PageHeader, Panel, inputCls } from "@/components/ui";
import { ErrorBox, Loading } from "@/components/kids";
import { PRINTABLE_TYPES, TYPE_META, GAME_LABEL } from "@/lib/contentMeta";
import type { ContentItem } from "@/lib/types";
import { CONTENT_TYPES } from "@/lib/types";
import { ActivityBody } from "../players/ItemPlayer";
import { HomeOnly } from "@/components/online";
import { ONLINE } from "@/lib/mode";

/** Grouped list of practice items with review actions (used for units and inspiration topics). */
export function ItemList({ items, onChange }: { items: ContentItem[]; onChange: () => void }) {
  const drafts = items.filter((i) => i.status === "draft");
  const act = async (id: string, body: object | null) => {
    if (body === null) await api(`/api/items/${id}`, { method: "DELETE" });
    else await api(`/api/items/${id}`, { method: "PATCH", body });
    onChange();
  };
  if (!items.length) return <p className="text-ink-soft">{ONLINE ? "No lessons published here yet." : "No practice items yet. Generate a pack above."}</p>;
  return (
    <div className="flex flex-col gap-4">
      {drafts.length > 0 && !ONLINE && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-orange-soft p-3">
          <span className="font-bold">{drafts.length} draft(s) waiting for review.</span>
          <Button
            variant="grass"
            onClick={async () => {
              for (const d of drafts) await api(`/api/items/${d.id}`, { method: "PATCH", body: { status: "approved" } });
              onChange();
            }}
          >
            ✅ Approve all
          </Button>
        </div>
      )}
      {CONTENT_TYPES.filter((t) => items.some((i) => i.type === t)).map((t) => (
        <div key={t}>
          <h3 className={`mb-2 font-display text-lg font-bold ${TYPE_META[t].text}`}>
            {TYPE_META[t].icon} {TYPE_META[t].label}
          </h3>
          <div className="grid gap-2 md:grid-cols-2">
            {items
              .filter((i) => i.type === t)
              .map((i) => (
                <div key={i.id} className={`flex flex-col gap-2 rounded-2xl border-2 p-3 ${i.status === "draft" ? "border-dashed border-orange" : "border-line"}`}>
                  <div className="flex items-start gap-2">
                    <Link href={`/parent/items/${i.id}`} className="min-w-0 flex-1 font-bold hover:underline">
                      {i.title}
                      {i.type === "game" && <span className="ml-1 text-sm font-normal text-ink-soft">({GAME_LABEL[(i.data as { game: keyof typeof GAME_LABEL }).game]})</span>}
                    </Link>
                    <Badge tone={i.status === "approved" ? "grass" : "orange"}>{i.status === "approved" ? "Live" : "Draft"}</Badge>
                    <Badge tone="gray">{i.createdBy === "claude" ? "🤖" : i.createdBy === "demo" ? "demo" : "⚡"}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <LinkButton href={`/parent/items/${i.id}`}>{ONLINE ? "👀 Preview" : "✏️ Edit · 👀 Preview"}</LinkButton>
                    {ONLINE ? null : i.status === "draft" ? (
                      <Button variant="grass" onClick={() => act(i.id, { status: "approved" })}>
                        ✅ Approve
                      </Button>
                    ) : (
                      <Button onClick={() => act(i.id, { status: "draft" })}>Hide</Button>
                    )}
                    {PRINTABLE_TYPES.includes(i.type) && (
                      <LinkButton href={`/print/${i.id}`} target="_blank">
                        🖨️
                      </LinkButton>
                    )}
                    <LinkButton href={`/present/${i.id}`} target="_blank">
                      📺
                    </LinkButton>
                    <HomeOnly>
                      <Button variant="danger" onClick={() => confirm(`Delete “${i.title}”?`) && act(i.id, null)}>
                        🗑️
                      </Button>
                    </HomeOnly>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

type ItemData = { item: ContentItem; parent: { kind: "unit" | "topic"; id: string; title: string } | null; pictures: PictureMap };

/** Preview + edit one item. */
export function ItemDetail({ itemId }: { itemId: string }) {
  const { data, error, reload, setData } = useApi<ItemData>(`/api/items/${itemId}`);
  const [saved, setSaved] = useState(false);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  return (
    <ItemEditor
      key={data.item.updatedAt}
      data={data}
      saved={saved}
      onSaved={(item) => {
        setSaved(true);
        setData({ ...data, item });
      }}
    />
  );
}

function ItemEditor({ data, onSaved, saved }: { data: ItemData; onSaved: (item: ContentItem) => void; saved: boolean }) {
  const { item, parent, pictures } = data;
  const [draft, setDraft] = useState<unknown>(item.data);
  const [title, setTitle] = useState(item.title);
  const [preview, setPreview] = useState<unknown>(item.data);
  const [json, setJson] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; details?: string } | null>(null);
  const [round, setRound] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meta = TYPE_META[item.type];
  const back = parent ? (parent.kind === "unit" ? `/parent/units/${parent.id}` : `/parent/inspiration/${parent.id}`) : "/parent";
  const dirty = title.trim() !== item.title || JSON.stringify(draft) !== JSON.stringify(item.data);
  const check = useMemo(() => validateItemData(item.type, draft), [item.type, draft]);
  const previewCheck = useMemo(() => validateItemData(item.type, preview), [item.type, preview]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const edit = (v: unknown) => {
    // A game switched to another kind keeps a matching title (unless the parent wrote their own).
    const was = (draft as { game?: GameKind } | null)?.game;
    const now = (v as { game?: GameKind } | null)?.game;
    if (item.type === "game" && was && now && was !== now && title.trim() === GAMES[was].label) setTitle(GAMES[now].label);
    setDraft(v);
    setMsg(null);
    // The preview follows after a short pause, so it doesn't restart on every key.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPreview(v), 700);
  };

  const save = async (body: object) => {
    setMsg(null);
    try {
      const r = await api<{ item: ContentItem }>(`/api/items/${item.id}`, { method: "PATCH", body });
      onSaved(r.item);
    } catch (e) {
      const err = e as Error & { details?: string };
      setMsg({ ok: false, text: err.message, details: err.details });
    }
  };
  const saveAll = () => save({ ...(title.trim() && title.trim() !== item.title ? { title: title.trim() } : {}), data: draft });
  const discard = () => {
    setDraft(item.data);
    setPreview(item.data);
    setTitle(item.title);
    setJson(null);
    setMsg(null);
  };
  const shown: ContentItem = previewCheck.success ? { ...item, data: previewCheck.data as ContentItem["data"] } : item;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <p className="text-sm font-bold text-ink-soft">
        <Link href={back} className="underline">
          ← {parent?.title ?? "Back"}
        </Link>
      </p>
      <PageHeader
        emoji={meta.icon}
        title={item.title}
        subtitle={
          <span className="flex flex-wrap gap-2">
            <Badge tone={item.status === "approved" ? "grass" : "orange"}>{item.status === "approved" ? "Live for children" : "Draft"}</Badge>
            <Badge tone="gray">{meta.label}</Badge>
            <Badge tone={item.source === "book" ? "sun" : "grape"}>{item.source === "book" ? "📘 Book" : "✨ Inspiration"}</Badge>
          </span>
        }
        actions={
          <>
            <HomeOnly>
              <Button variant={item.status === "draft" ? "grass" : "ghost"} onClick={() => save({ status: item.status === "draft" ? "approved" : "draft" })}>
                {item.status === "draft" ? "✅ Approve" : "Hide from children"}
              </Button>
            </HomeOnly>
            {PRINTABLE_TYPES.includes(item.type) && (
              <LinkButton href={`/print/${item.id}`} target="_blank">
                🖨️ Print
              </LinkButton>
            )}
            <LinkButton href={`/present/${item.id}`} target="_blank">
              📺 Show on TV
            </LinkButton>
          </>
        }
      />
      {msg && (
        <div className={`rounded-2xl p-3 ${msg.ok ? "bg-grass-soft" : "bg-berry-soft"}`}>
          <b>{msg.text}</b>
          {msg.details && <pre className="mt-2 whitespace-pre-wrap text-sm">{msg.details}</pre>}
        </div>
      )}
      <div className={`grid items-start gap-6 ${ONLINE ? "" : "xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"}`}>
        {/* Lessons are changed in the app at home; online shows the preview only. */}
        {!ONLINE && (
        <Panel title="✏️ Edit the lesson">
          <p className="mb-4 text-sm text-ink-soft">Change any text, word, choice or answer. Changes are only kept when you press 💾 Save.</p>
          <label className="mb-4 flex flex-col gap-1">
            <span className="text-sm font-bold text-ink-soft">Title</span>
            <input className={`${inputCls} text-lg font-bold`} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
          </label>
          <PicturesProvider pictures={pictures}>
            <ContentForm type={item.type} value={draft} onChange={edit} />
          </PicturesProvider>
          <details className="mt-6">
            <summary className="cursor-pointer text-sm font-bold text-ink-soft">Advanced: edit as JSON</summary>
            <textarea className={`${inputCls} mt-2 h-80 w-full font-mono text-xs`} value={json ?? JSON.stringify(draft, null, 2)} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
            <Button
              className="mt-2"
              disabled={json === null}
              onClick={() => {
                try {
                  edit(JSON.parse(json!));
                  setJson(null);
                } catch (e) {
                  setMsg({ ok: false, text: "That is not valid JSON: " + (e as Error).message });
                }
              }}
            >
              Use this JSON
            </Button>
          </details>
        </Panel>
        )}
        <div className="flex flex-col gap-4 xl:sticky xl:top-4">
          <Panel title="👀 Preview (as your child sees it)">
            {!previewCheck.success && <p className="mb-2 rounded-xl bg-orange-soft p-2 text-sm">Showing the last good version — finish the edit to see it here.</p>}
            <div className="max-h-[75vh] overflow-auto rounded-2xl bg-cream p-4">
              <ActivityBody key={`${round}-${JSON.stringify(shown.data).length}-${hashText(JSON.stringify(shown.data))}`} item={shown} pictures={pictures} prefetch={!dirty} onDone={() => setRound((r) => r + 1)} showVi />
            </div>
          </Panel>
        </div>
      </div>

      <HomeOnly>
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-line bg-paper p-3 shadow-lg">
          <Button variant="primary" disabled={!dirty || !check.success || !title.trim()} onClick={saveAll}>
            💾 Save changes
          </Button>
          <Button disabled={!dirty} onClick={discard}>
            ↩ Undo all changes
          </Button>
          {dirty && !check.success && (
            <span className="text-sm font-bold text-berry-deep" title={z.prettifyError(check.error)}>
              ⚠️ {friendlyProblem(check.error)}
            </span>
          )}
          {dirty && check.success && <span className="text-sm font-bold text-orange-deep">Unsaved changes</span>}
          {!dirty && saved && <span className="text-sm font-bold text-grass-deep">✅ Saved</span>}
        </div>
      </HomeOnly>
    </div>
  );
}

function hashText(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/** First problem of an invalid edit, in plain words. */
function friendlyProblem(e: z.ZodError) {
  const issue = e.issues[0];
  if (!issue) return "Something is not finished.";
  const where = issue.path.filter((p) => typeof p === "string").at(-1);
  const what = where ? `“${String(where)}”` : "a field";
  if (issue.code === "too_small") return `${what} is empty or too short.`;
  if (issue.code === "too_big") return `${what} has too many entries.`;
  if (issue.message.includes("answer")) return "The right answer must be one of the choices.";
  return `${what}: ${issue.message}`;
}

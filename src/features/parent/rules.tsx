"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/client/api";
import { Badge, Button, PageHeader, Panel, inputCls } from "@/components/ui";
import { ErrorBox, Loading } from "@/components/kids";
import { RULE_EFFECT, isBuiltInRule, type LessonRule } from "@/lib/rules";
import { HomeOnly } from "@/components/online";
import { ONLINE } from "@/lib/mode";

type RulesData = { rules: LessonRule[]; defaults: LessonRule[] };

/** Parent page: the rules every lesson made from a book must follow. */
export function RulesPage() {
  const { data, error, reload, setData } = useApi<RulesData>("/api/rules");
  const [saved, setSaved] = useState(false);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  return (
    <RulesEditor
      key={JSON.stringify(data.rules)}
      data={data}
      saved={saved}
      onSaved={(rules) => {
        setSaved(true);
        setData({ ...data, rules });
      }}
    />
  );
}

function RulesEditor({ data, onSaved, saved }: { data: RulesData; onSaved: (rules: LessonRule[]) => void; saved: boolean }) {
  const [rules, setRules] = useState<LessonRule[]>(data.rules);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(rules) !== JSON.stringify(data.rules);
  const upd = (i: number, patch: Partial<LessonRule>) => {
    setRules(rules.map((r, k) => (k === i ? { ...r, ...patch } : r)));
    setMsg(null);
  };

  const save = async (body: object) => {
    try {
      const r = await api<{ rules: LessonRule[] }>("/api/rules", { method: "PUT", body });
      onSaved(r.rules);
    } catch (e) {
      const err = e as Error & { details?: string };
      setMsg({ ok: false, text: `${err.message} ${err.details ?? ""}` });
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader emoji="📏" title="Lesson rules" subtitle="Every lesson made from a book follows these rules." />
      <Panel>
        {ONLINE && <p className="mb-2 font-bold">These are the rules the published lessons were made with. They are changed in the app on your home computer.</p>}
        <p>
          Emma follows these rules when it makes lessons from your books — when a book is added, and when you press <b>♻️ Remake</b>. Edit the words, switch a rule off, or add your own (English or Vietnamese is fine).
        </p>
        <p className="mt-2 text-sm text-ink-soft">
          Changes apply to lessons made from now on. To update lessons that already exist, open the book in{" "}
          <Link href="/parent/books" className="underline">
            📚 Books
          </Link>{" "}
          and press <b>♻️ Remake all lessons</b>. (“Book pictures” changes right away.)
        </p>
      </Panel>

      <fieldset disabled={ONLINE} className="flex min-w-0 flex-col gap-3">
        {rules.map((r, i) => {
          const builtIn = isBuiltInRule(r.id);
          const def = data.defaults.find((d) => d.id === r.id);
          return (
            <div key={r.id} className={`rounded-3xl border-2 p-4 transition ${r.on ? "border-grass bg-paper" : "border-line bg-cream opacity-75"}`}>
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sun font-display text-lg font-bold">{i + 1}</span>
                <label className="flex cursor-pointer items-center gap-2 font-bold">
                  <input type="checkbox" role="switch" className="h-6 w-6 accent-grass" checked={r.on} onChange={(e) => upd(i, { on: e.target.checked })} aria-label={`Rule ${i + 1} on`} />
                  {r.on ? "On" : "Off"}
                </label>
                {builtIn ? <Badge tone="sky">Built-in</Badge> : <Badge tone="grape">Your rule</Badge>}
                <span className="flex-1" />
                {builtIn && def && def.text !== r.text && (
                  <Button onClick={() => upd(i, { text: def.text })} title="Put back the original wording">
                    ↩ Original wording
                  </Button>
                )}
                {!builtIn && (
                  <Button variant="danger" aria-label={`Delete rule ${i + 1}`} onClick={() => setRules(rules.filter((_, k) => k !== i))}>
                    🗑️
                  </Button>
                )}
              </div>
              <textarea className={`${inputCls} w-full`} rows={2} value={r.text} maxLength={600} onChange={(e) => upd(i, { text: e.target.value })} aria-label={`Rule ${i + 1}`} />
              {builtIn && RULE_EFFECT[r.id] && <p className="mt-1 text-sm text-ink-soft">⚙️ {RULE_EFFECT[r.id]}</p>}
            </div>
          );
        })}
        <HomeOnly>
          <Button
            className="self-start"
            disabled={rules.length >= 30}
            onClick={() => setRules([...rules, { id: `custom-${Date.now().toString(36)}`, text: "", on: true }])}
          >
            + Add a rule
          </Button>
        </HomeOnly>
      </fieldset>

      <HomeOnly>
      <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-line bg-paper p-3 shadow-lg">
        <Button variant="primary" disabled={!dirty || rules.some((r) => !r.text.trim())} onClick={() => save({ rules })}>
          💾 Save rules
        </Button>
        <Button disabled={!dirty} onClick={() => setRules(data.rules)}>
          ↩ Undo changes
        </Button>
        <Button onClick={() => confirm("Go back to the 4 original rules? Your own rules will be removed.") && save({ reset: true })}>Reset to defaults</Button>
        {dirty && <span className="text-sm font-bold text-orange-deep">Unsaved changes</span>}
        {!dirty && saved && <span className="text-sm font-bold text-grass-deep">✅ Saved — new lessons will follow these rules.</span>}
        {msg && <span className={`text-sm font-bold ${msg.ok ? "text-grass-deep" : "text-berry-deep"}`}>{msg.text}</span>}
      </div>
      </HomeOnly>
    </div>
  );
}

/** A short line + link shown where lessons are made. */
export function RulesNote() {
  const { data } = useApi<RulesData>("/api/rules");
  const on = data?.rules.filter((r) => r.on).length;
  return (
    <p className="text-sm text-ink-soft">
      📏 Lessons follow your{" "}
      <Link href="/parent/rules" className="font-bold underline">
        lesson rules{on !== undefined ? ` (${on} on)` : ""}
      </Link>
      .
    </p>
  );
}

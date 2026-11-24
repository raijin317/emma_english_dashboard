"use client";

import { useMemo, type ReactNode } from "react";
import { z } from "zod";
import { dataSchemaByType, type ContentType } from "@/lib/schemas/content";
import { inputCls } from "@/components/ui";
import { Pic } from "@/components/Pic";
import { GAMES } from "@/lib/games";

/**
 * A friendly form for any lesson item, driven by the item type's Zod schema (via JSON Schema):
 * every text is a text box, lists can grow/shrink/reorder, answers are picked from the options.
 * Question/section kinds are fixed (add a new question to get another kind); a game's kind can be switched.
 */

type JS = {
  type?: string | string[];
  properties?: Record<string, JS>;
  required?: string[];
  items?: JS;
  oneOf?: JS[];
  anyOf?: JS[];
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
};
type Obj = Record<string, unknown>;
type Path = (string | number)[];

const schemaCache = new Map<ContentType, JS>();
function schemaFor(type: ContentType): JS {
  let s = schemaCache.get(type);
  if (!s) {
    s = z.toJSONSchema(dataSchemaByType[type], { io: "input", unrepresentable: "any" }) as JS;
    schemaCache.set(type, s);
  }
  return s;
}

/* --------------------------------- labels --------------------------------- */

const LABEL: Record<string, string> = {
  words: "Words",
  word: "Word",
  emoji: "Picture (emoji)",
  example: "Example sentence",
  vi: "Vietnamese (for you)",
  pattern: "Sentence pattern",
  explanation: "Explanation for the child",
  examples: "Examples",
  text: "Text",
  practice: "Practice questions",
  passage: "Reading text",
  questions: "Questions",
  prompt: "Question / instruction",
  options: "Choices",
  answer: "Right answer",
  statement: "Sentence (Yes or No?)",
  sentence: "Sentence (use ___ for the gap)",
  pairs: "Pairs",
  label: "Word",
  say: "What the voice says",
  question: "Question",
  intro: "Intro",
  tasks: "Listening tasks",
  prompts: "Things to say",
  mode: "Type",
  hint: "Hint",
  instructions: "Instructions",
  sections: "Sections",
  title: "Title",
  wordBank: "Word bank",
  items: "Items",
  minutes: "Minutes",
  objectives: "Goals",
  materials: "You need",
  steps: "Steps",
  stage: "Stage",
  activity: "Activity",
  parentScript: "What you say / do",
  game: "Game",
  category: "Basket",
  categories: "Baskets",
  skill: "Skill",
};
const KIND_LABEL: Record<string, string> = {
  mc: "Multiple choice",
  picture: "Picture choice",
  tf: "Yes / No",
  fill: "Fill the gap",
  match: "Match",
  order: "Put in order",
  trace: "Trace",
  circle: "Look and circle",
  wordsearch: "Word search",
  draw: "Draw",
};
const LONG = new Set(["passage", "explanation", "parentScript", "activity", "intro", "instructions", "say", "statement", "example", "text", "prompt"]);
const ITEM_NAME: Record<string, string> = {
  words: "word",
  examples: "example",
  practice: "question",
  questions: "question",
  pairs: "pair",
  tasks: "task",
  prompts: "prompt",
  sections: "section",
  items: "item",
  steps: "step",
  options: "choice",
  objectives: "goal",
  materials: "thing",
  categories: "basket",
  wordBank: "word",
};
const label = (key: string) => LABEL[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

/* --------------------------------- helpers -------------------------------- */

const variants = (s: JS) => s.oneOf ?? s.anyOf;
const constOf = (s: JS) => Object.entries(s.properties ?? {}).find(([, p]) => p.const !== undefined);

function pickVariant(s: JS, v: unknown): JS {
  const vs = variants(s)!;
  if (v && typeof v === "object") {
    const hit = vs.find((b) => {
      const c = constOf(b);
      return c && (v as Obj)[c[0]] === c[1].const;
    });
    if (hit) return hit;
  }
  return vs[0];
}

export function defaultFor(s: JS): unknown {
  if (variants(s)) return defaultFor(variants(s)![0]);
  if (s.const !== undefined) return s.const;
  if (s.default !== undefined) return structuredClone(s.default);
  if (s.enum) return s.enum[0];
  const t = Array.isArray(s.type) ? s.type[0] : s.type;
  if (t === "object") {
    const o: Obj = {};
    for (const k of s.required ?? []) o[k] = defaultFor(s.properties![k]);
    return o;
  }
  if (t === "array") return Array.from({ length: Math.min(2, s.minItems ?? 0) }, () => defaultFor(s.items ?? {}));
  if (t === "boolean") return true;
  if (t === "number" || t === "integer") return s.minimum ?? 1;
  return "";
}

const summary = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (!v || typeof v !== "object") return String(v ?? "");
  const o = v as Obj;
  const kind = typeof o.kind === "string" ? KIND_LABEL[o.kind] ?? o.kind : null;
  const text = ["word", "prompt", "statement", "sentence", "text", "say", "title", "activity", "label", "question"].map((k) => o[k]).find((x) => typeof x === "string" && x);
  return [kind, text as string | undefined].filter(Boolean).join(" · ");
};

function setIn(root: unknown, path: Path, value: unknown): unknown {
  if (!path.length) return value;
  const [head, ...rest] = path;
  const copy = (Array.isArray(root) ? [...root] : { ...(root as Obj) }) as Obj & unknown[];
  const next = setIn((copy as Obj)[head as string], rest, value);
  if (next === undefined) delete (copy as Obj)[head as string];
  else (copy as Obj)[head as string] = next;
  return copy;
}

/* ---------------------------------- form ---------------------------------- */

export function ContentForm({ type, value, onChange }: { type: ContentType; value: unknown; onChange: (v: unknown) => void }) {
  const schema = useMemo(() => schemaFor(type), [type]);
  return <ObjectFields schema={schema} value={value as Obj} path={[]} root={value} onRoot={onChange} />;
}

type FieldProps = { root: unknown; onRoot: (v: unknown) => void; path: Path };

function ObjectFields({ schema, value, ...p }: FieldProps & { schema: JS; value: Obj }) {
  const props = Object.entries(schema.properties ?? {});
  return (
    <div className="flex flex-col gap-3">
      {props.map(([key, s]) => {
        if (s.const !== undefined) return null; // the kind of a question/section is shown in its header
        if (key === "game" && p.path.length === 0) return <GameKindField key={key} value={value} root={p.root} onRoot={p.onRoot} />;
        const v = value?.[key];
        const optional = !(schema.required ?? []).includes(key);
        return <Field key={key} k={key} schema={s} value={v} parent={value} optional={optional} {...p} path={[...p.path, key]} />;
      })}
    </div>
  );
}

/**
 * The kind of a mini game. All games use the same words, so any kind can be chosen — except "sort", which needs
 * categories (and is only offered when the game already has them).
 */
function GameKindField({ value, root, onRoot }: { value: Obj; root: unknown; onRoot: (v: unknown) => void }) {
  const current = String(value?.game ?? "");
  const hasCats = Array.isArray(value?.categories) && (value.categories as unknown[]).length >= 2;
  return (
    <Row k="game">
      <select aria-label="Game" className={`${inputCls} flex-1 font-bold`} value={current} onChange={(e) => onRoot(setIn(root, ["game"], e.target.value))}>
        {Object.entries(GAMES)
          .filter(([k, g]) => k === current || g.needs !== "categories" || hasCats)
          .map(([k, g]) => (
            <option key={k} value={k}>
              {g.icon} {g.label}
            </option>
          ))}
      </select>
    </Row>
  );
}

function Row({ k, children, wide }: { k: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`flex gap-1 ${wide ? "flex-col" : "flex-col sm:flex-row sm:items-center sm:gap-3"}`}>
      <span className={`shrink-0 text-sm font-bold text-ink-soft ${wide ? "" : "sm:w-40"}`}>{label(k)}</span>
      {children}
    </label>
  );
}

function Field({ k, schema, value, parent, optional, root, onRoot, path }: FieldProps & { k: string; schema: JS; value: unknown; parent: Obj; optional: boolean }) {
  const set = (v: unknown) => onRoot(setIn(root, path, v));
  const t = Array.isArray(schema.type) ? schema.type[0] : schema.type;

  // The right answer is picked from the choices, so it always matches one.
  if (k === "answer" && Array.isArray(parent?.options)) {
    const opts = (parent.options as unknown[]).map((o) => (typeof o === "string" ? o : String((o as Obj).label ?? ""))).filter(Boolean);
    return (
      <Row k={k}>
        <select className={`${inputCls} flex-1 font-bold`} value={String(value ?? "")} onChange={(e) => set(e.target.value)}>
          {!opts.includes(String(value)) && <option value={String(value ?? "")}>{String(value ?? "") || "— choose —"}</option>}
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Row>
    );
  }
  if (k === "answer" && t === "boolean") {
    return (
      <Row k="answer">
        <select className={`${inputCls} flex-1 font-bold`} value={value ? "yes" : "no"} onChange={(e) => set(e.target.value === "yes")}>
          <option value="yes">👍 Yes, it&apos;s true</option>
          <option value="no">👎 No, it&apos;s not true</option>
        </select>
      </Row>
    );
  }
  if (schema.enum) {
    return (
      <Row k={k}>
        <select className={`${inputCls} flex-1`} value={String(value ?? "")} onChange={(e) => set(e.target.value)}>
          {schema.enum.map((o) => (
            <option key={String(o)} value={String(o)}>
              {String(o)}
            </option>
          ))}
        </select>
      </Row>
    );
  }
  if (t === "array") return <ArrayField k={k} schema={schema} value={(value as unknown[]) ?? []} root={root} onRoot={onRoot} path={path} />;
  if (t === "object" || variants(schema)) {
    const s = variants(schema) ? pickVariant(schema, value) : schema;
    return (
      <div className="flex flex-col gap-1">
        <span className="text-sm font-bold text-ink-soft">{label(k)}</span>
        <div className="rounded-2xl border-2 border-line p-3">
          <ObjectFields schema={s} value={(value as Obj) ?? {}} root={root} onRoot={onRoot} path={path} />
        </div>
      </div>
    );
  }
  if (t === "boolean")
    return (
      <Row k={k}>
        <input type="checkbox" className="h-6 w-6" checked={!!value} onChange={(e) => set(e.target.checked)} />
      </Row>
    );
  if (t === "number" || t === "integer")
    return (
      <Row k={k}>
        <input type="number" className={`${inputCls} w-28`} min={schema.minimum} max={schema.maximum} value={Number(value ?? 0)} onChange={(e) => set(Number(e.target.value))} />
      </Row>
    );

  // Text. An optional text left empty is removed (instead of failing "too short").
  const text = String(value ?? "");
  const onText = (v: string) => set(optional && !v.trim() ? undefined : v);
  if (k === "emoji") {
    const word = typeof parent?.word === "string" ? parent.word : typeof parent?.label === "string" ? parent.label : typeof parent?.answer === "string" ? parent.answer : undefined;
    return (
      <Row k={k}>
        <span className="flex items-center gap-2">
          <input className={`${inputCls} w-24 text-center text-2xl`} value={text} onChange={(e) => onText(e.target.value)} aria-label={label(k)} />
          <span className="text-4xl" title="What the child sees (the book's picture when there is one)">
            <Pic emoji={text} word={word} />
          </span>
        </span>
      </Row>
    );
  }
  const wide = LONG.has(k) || text.length > 60;
  return (
    <Row k={k} wide={wide}>
      {wide ? (
        <textarea className={`${inputCls} w-full`} rows={k === "passage" ? Math.max(4, text.split("\n").length + 1) : 2} value={text} onChange={(e) => onText(e.target.value)} />
      ) : (
        <input className={`${inputCls} flex-1 ${k === "word" || k === "label" ? "font-bold" : ""}`} value={text} onChange={(e) => onText(e.target.value)} />
      )}
    </Row>
  );
}

function ArrayField({ k, schema, value, root, onRoot, path }: FieldProps & { k: string; schema: JS; value: unknown[] }) {
  const item = schema.items ?? {};
  const set = (v: unknown[]) => onRoot(setIn(root, path, v));
  const move = (i: number, d: number) => {
    const a = [...value];
    [a[i], a[i + d]] = [a[i + d], a[i]];
    set(a);
  };
  const canAdd = schema.maxItems === undefined || value.length < schema.maxItems;
  const canRemove = value.length > (schema.minItems ?? 0);
  const name = ITEM_NAME[k] ?? "item";
  const it = Array.isArray(item.type) ? item.type[0] : item.type;
  const simple = it === "string" && !item.enum;

  if (simple)
    return (
      <div className="flex flex-col gap-1">
        <span className="text-sm font-bold text-ink-soft">{label(k)}</span>
        <div className="flex flex-wrap items-center gap-2">
          {value.map((v, i) => (
            <span key={i} className="flex items-center gap-1">
              <input className={`${inputCls} w-40`} value={String(v)} onChange={(e) => set(value.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`${label(k)} ${i + 1}`} />
              {canRemove && (
                <button type="button" className="rounded-lg px-1 text-ink-soft hover:bg-berry-soft" aria-label={`Remove ${name}`} onClick={() => set(value.filter((_, j) => j !== i))}>
                  ✕
                </button>
              )}
            </span>
          ))}
          {canAdd && (
            <button type="button" className="rounded-xl border-2 border-dashed border-line px-3 py-1 text-sm font-bold text-ink-soft hover:border-sun" onClick={() => set([...value, ""])}>
              + {name}
            </button>
          )}
        </div>
      </div>
    );

  const kinds = variants(item);
  const add = (v: unknown) => set([...value, v]);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-bold text-ink-soft">
        {label(k)} ({value.length})
      </span>
      {value.map((v, i) => {
        const s = kinds ? pickVariant(item, v) : item;
        return (
          <details key={i} open={value.length <= 8} className="group rounded-2xl border-2 border-line bg-paper">
            <summary className="flex cursor-pointer list-none items-center gap-2 p-2 pl-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sun-soft text-sm font-bold">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-bold">{summary(v) || `${name} ${i + 1}`}</span>
              <span className="flex shrink-0 gap-1" onClick={(e) => e.preventDefault()}>
                <IconBtn label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </IconBtn>
                <IconBtn label="Move down" disabled={i === value.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </IconBtn>
                <IconBtn label={`Copy this ${name}`} disabled={!canAdd} onClick={() => set([...value.slice(0, i + 1), structuredClone(v), ...value.slice(i + 1)])}>
                  ⧉
                </IconBtn>
                <IconBtn label={`Remove this ${name}`} disabled={!canRemove} onClick={() => set(value.filter((_, j) => j !== i))} danger>
                  ✕
                </IconBtn>
              </span>
            </summary>
            <div className="border-t-2 border-line p-3">
              {(Array.isArray(s.type) ? s.type[0] : s.type) === "object" ? (
                <ObjectFields schema={s} value={v as Obj} root={root} onRoot={onRoot} path={[...path, i]} />
              ) : (
                <Field k={k} schema={s} value={v} parent={{}} optional={false} root={root} onRoot={onRoot} path={[...path, i]} />
              )}
            </div>
          </details>
        );
      })}
      {canAdd &&
        (kinds ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-bold text-ink-soft">+ Add {name}:</span>
            {kinds.map((b) => {
              const c = constOf(b);
              const kind = String(c?.[1].const ?? "");
              return (
                <button key={kind} type="button" className="rounded-xl border-2 border-dashed border-line px-3 py-1 font-bold hover:border-sun" onClick={() => add(defaultFor(b))}>
                  {KIND_LABEL[kind] ?? kind}
                </button>
              );
            })}
          </div>
        ) : (
          <button
            type="button"
            className="self-start rounded-xl border-2 border-dashed border-line px-3 py-1 text-sm font-bold text-ink-soft hover:border-sun"
            onClick={() => add(value.length ? structuredClone(value[value.length - 1]) : defaultFor(item))}
          >
            + Add {name}
          </button>
        ))}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border-2 border-line font-bold disabled:opacity-30 ${danger ? "hover:bg-berry-soft" : "hover:bg-sun-soft"}`}
    >
      {children}
    </button>
  );
}

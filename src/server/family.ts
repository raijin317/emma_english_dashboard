import { ONLINE } from "@/lib/mode";
import { STARS_PER_STICKER, STICKERS } from "@/lib/stickers";
import { NATURAL_VOICES } from "@/lib/voices";
import type { AppSettings, Child, ChildStats } from "@/lib/types";
import { FAMILY_SCHEMA, newId, now } from "./db";
import * as repo from "./repo";
import { snapshotVoice } from "./snapshot";
import {
  INSERT_ATTEMPT_SQL,
  INSERT_STICKER_SQL,
  SAVE_CHILD_SQL,
  appSettingsFrom,
  attemptValues,
  childValues,
  hashPin,
  starsFor,
  statsFrom,
  stickerGain,
  toChild,
  type AttemptInput,
  type AttemptResult,
  type ChildInput,
  type Row,
} from "./repo";

/**
 * The family's own data — settings, PIN, children and their progress — for the routes that also run online.
 * Home: the SQLite file (repo.ts). Online: Cloudflare D1 (binding "DB"), so progress survives every new build.
 * Lessons are not here: home = SQLite, online = the read-only snapshot (snapshot.ts).
 */
export type FamilyDump = { app: "emma-english-studio"; version: 1; exportedAt: string; tables: Record<string, Row[]> };
export type FamilyStore = {
  settings(): Promise<AppSettings>;
  getSetting(key: string): Promise<string | null>;
  setSettings(values: Record<string, string>): Promise<void>;
  checkPin(pin: string): Promise<boolean>;
  setPin(pin: string): Promise<void>;
  listChildren(): Promise<Child[]>;
  getChild(id: string): Promise<Child | null>;
  saveChild(c: ChildInput): Promise<Child>;
  deleteChild(id: string): Promise<void>;
  setActiveBook(childId: string, bookId: string): Promise<void>;
  topicChildren(topicId: string): Promise<{ id: string; name: string; avatar: string }[]>;
  recordAttempt(a: AttemptInput): Promise<AttemptResult>;
  childStats(childId: string): Promise<ChildStats>;
  exportAll(): Promise<FamilyDump | ReturnType<typeof repo.exportAll>>;
  importAll(dump: { tables: Record<string, Row[]> }): Promise<void>;
};

/* --------------------------------- home --------------------------------- */

const homeStore: FamilyStore = {
  settings: async () => repo.getAppSettings(),
  getSetting: async (k) => repo.getSetting(k),
  setSettings: async (values) => Object.entries(values).forEach(([k, v]) => repo.setSetting(k, v)),
  checkPin: async (pin) => repo.checkPin(pin),
  setPin: async (pin) => repo.setPin(pin),
  listChildren: async () => repo.listChildren(),
  getChild: async (id) => repo.getChild(id),
  saveChild: async (c) => repo.saveChild(c),
  deleteChild: async (id) => repo.deleteChild(id),
  setActiveBook: async (c, b) => repo.setActiveBook(c, b),
  topicChildren: async (t) => repo.topicChildren(t),
  recordAttempt: async (a) => repo.recordAttempt(a),
  childStats: async (id) => repo.childStats(id),
  exportAll: async () => repo.exportAll(),
  importAll: async (dump) => repo.importAll(dump),
};

/* -------------------------------- online -------------------------------- */

/** The part of the D1 API used here (typed locally, so the home build needs no Cloudflare types). */
export type D1Statement = { bind(...values: unknown[]): D1Statement; all<T = Row>(): Promise<{ results: T[] }>; first<T = Row>(): Promise<T | null>; run(): Promise<unknown> };
export type D1Like = { prepare(sql: string): D1Statement; batch(statements: D1Statement[]): Promise<unknown[]> };

/** Family tables of a backup; the online version keeps (and restores) only these. */
export const FAMILY_TABLES = ["settings", "children", "attempts", "stickers"] as const;
/** Settings that mean something online (the rest — lesson rules, picture mode, voice choice — come from home). */
const ONLINE_SETTING_KEYS = ["pinHash", "ttsEngine", "voiceName", "childRate", "soundOn", "breakMinutes"];
const COLUMNS: Record<(typeof FAMILY_TABLES)[number], string[]> = {
  settings: ["key", "value"],
  children: ["id", "name", "avatar", "age", "active_book_id", "book_ids", "topic_ids", "daily_goal_minutes", "created_at"],
  attempts: ["id", "child_id", "content_item_id", "score", "max_score", "stars", "duration_sec", "missed", "created_at"],
  stickers: ["id", "child_id", "code", "earned_at"],
};

/**
 * Online settings: the natural voice is the one the clips were made with at home, so every sentence has its clip;
 * without exported clips the browser voice is used. The speed is the parent's (default: the clips' own speed) —
 * the browser plays the clips faster or slower to match it (`clipRate`, see clipPlaybackRate).
 */
export function onlineSettings(stored: (key: string) => string | null): AppSettings {
  const base = appSettingsFrom(stored);
  const v = snapshotVoice();
  const voice = v && NATURAL_VOICES.some((x) => x.id === v.voice) ? v : null;
  return {
    ...base,
    ttsEngine: voice && base.ttsEngine === "natural" ? "natural" : "browser",
    ttsVoice: voice?.voice ?? base.ttsVoice,
    childRate: stored("childRate") === null && voice ? voice.childRate : base.childRate,
    clipRate: voice?.childRate,
    topicPictures: "off",
  };
}

export function d1Store(getDb: () => Promise<D1Like>): FamilyStore {
  let ready: Promise<D1Like> | null = null;
  // Tables are made on first use (CREATE … IF NOT EXISTS), so a new D1 database needs no setup step.
  const db = () =>
    (ready ??= getDb().then(async (d) => {
      await d.batch(FAMILY_SCHEMA.map((s) => d.prepare(s)));
      return d;
    })).catch((e) => {
      ready = null;
      throw e;
    });
  const all = async (sql: string, ...args: unknown[]) => (await (await db()).prepare(sql).bind(...args).all<Row>()).results;
  const first = async (sql: string, ...args: unknown[]) => (await db()).prepare(sql).bind(...args).first<Row>();
  const stmt = async (sql: string, ...args: unknown[]) => (await db()).prepare(sql).bind(...args);

  const settingsMap = async () => new Map((await all("SELECT key, value FROM settings")).map((r) => [String(r.key), String(r.value)]));
  const getChild = async (id: string) => {
    const r = await first("SELECT * FROM children WHERE id = ?", id);
    return r ? toChild(r) : null;
  };
  const listChildren = async () => (await all("SELECT * FROM children ORDER BY created_at")).map(toChild);
  const owned = async (childId: string) => (await all("SELECT code FROM stickers WHERE child_id = ? ORDER BY earned_at, rowid", childId)).map((r) => String(r.code));

  const store: FamilyStore = {
    settings: async () => {
      const m = await settingsMap();
      return onlineSettings((k) => m.get(k) ?? null);
    },
    getSetting: async (key) => {
      const r = await first("SELECT value FROM settings WHERE key = ?", key);
      return r ? String(r.value) : null;
    },
    setSettings: async (values) => {
      const d = await db();
      const entries = Object.entries(values);
      if (entries.length) await d.batch(entries.map(([k, v]) => d.prepare("INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, v)));
    },
    checkPin: async (pin) => {
      const h = await store.getSetting("pinHash");
      return !h || h === hashPin(pin);
    },
    setPin: (pin) => store.setSettings({ pinHash: hashPin(pin) }),
    listChildren,
    getChild,
    saveChild: async (c) => {
      const existing = c.id ? await getChild(c.id) : null;
      const values = childValues(c, () => existing);
      await (await stmt(SAVE_CHILD_SQL, ...values)).run();
      return (await getChild(values[0]))!;
    },
    deleteChild: async (id) => {
      const d = await db();
      await d.batch(["attempts", "stickers"].map((t) => d.prepare(`DELETE FROM ${t} WHERE child_id = ?`).bind(id)).concat(d.prepare("DELETE FROM children WHERE id = ?").bind(id)));
    },
    setActiveBook: async (childId, bookId) => {
      const c = await getChild(childId);
      if (c && c.bookIds.includes(bookId)) await (await stmt("UPDATE children SET active_book_id = ? WHERE id = ?", bookId, childId)).run();
    },
    topicChildren: async (topicId) => (await listChildren()).filter((c) => c.topicIds.includes(topicId)).map((c) => ({ id: c.id, name: c.name, avatar: c.avatar })),
    recordAttempt: async (a) => {
      const stars = starsFor(a.score, a.maxScore);
      const before = Number((await first("SELECT COALESCE(SUM(stars),0) AS s FROM attempts WHERE child_id = ?", a.childId))?.s ?? 0);
      const gain = stickerGain((await owned(a.childId)).length, before + stars);
      const d = await db();
      // One batch = one transaction: the attempt and the stickers it earned are saved together.
      await d.batch([d.prepare(INSERT_ATTEMPT_SQL).bind(...attemptValues(a, stars)), ...gain.newStickers.map((code) => d.prepare(INSERT_STICKER_SQL).bind(newId("st_"), a.childId, code, now()))]);
      return { stars, ...gain };
    },
    childStats: async (childId) => statsFrom(await all("SELECT * FROM attempts WHERE child_id = ? ORDER BY created_at", childId), await owned(childId)),
    exportAll: async () => {
      const tables: Record<string, Row[]> = {};
      for (const t of FAMILY_TABLES) tables[t] = await all(`SELECT ${COLUMNS[t].join(", ")} FROM ${t}`);
      return { app: "emma-english-studio", version: 1, exportedAt: now(), tables };
    },
    /** Restores the family part of a backup (from home or from online) in one transaction; the lessons stay as published. */
    importAll: async (dump) => {
      const d = await db();
      const tables = { ...dump.tables };
      if (Array.isArray(tables.stickers)) tables.stickers = albumStickers(tables.stickers, Array.isArray(tables.attempts) ? tables.attempts : []);
      const ops: D1Statement[] = [];
      for (const t of FAMILY_TABLES) {
        const rows = tables[t];
        if (!Array.isArray(rows)) continue;
        ops.push(d.prepare(`DELETE FROM ${t}`));
        for (const r of rows) {
          if (t === "settings" && !ONLINE_SETTING_KEYS.includes(String(r.key))) continue;
          const cols = COLUMNS[t].filter((c) => c in r);
          if (!cols.length) continue;
          ops.push(d.prepare(`INSERT INTO ${t}(${cols.join(",")}) VALUES(${cols.map(() => "?").join(",")})`).bind(...cols.map((c) => r[c] ?? null)));
        }
      }
      if (ops.length) await d.batch(ops);
    },
  };
  return store;
}

/**
 * Sticker rows as the album wants them (same as syncStickers in db.ts): per child the first N album stickers in the
 * order they were earned (an old backup's codes are moved into the album), plus the ones their stars already pay for.
 */
export function albumStickers(stickers: Row[], attempts: Row[]): Row[] {
  const byChild = new Map<string, Row[]>();
  for (const s of stickers) byChild.set(String(s.child_id), [...(byChild.get(String(s.child_id)) ?? []), s]);
  const stars = new Map<string, number>();
  for (const a of attempts) stars.set(String(a.child_id), (stars.get(String(a.child_id)) ?? 0) + Number(a.stars ?? 0));
  const out: Row[] = [];
  for (const child of new Set([...byChild.keys(), ...stars.keys()])) {
    const rows = (byChild.get(child) ?? []).sort((a, b) => String(a.earned_at).localeCompare(String(b.earned_at)));
    const want = Math.min(STICKERS.length, Math.max(rows.length, Math.floor((stars.get(child) ?? 0) / STARS_PER_STICKER)));
    for (let k = 0; k < want; k++) out.push({ id: rows[k]?.id ?? `st_${child}_${k}_${Date.now().toString(36)}`, child_id: child, code: STICKERS[k], earned_at: rows[k]?.earned_at ?? now() });
  }
  return out;
}

/** The Worker's D1 binding (Cloudflare only). */
async function workerDb(): Promise<D1Like> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env } = await getCloudflareContext({ async: true });
  const d1 = (env as unknown as { DB?: D1Like }).DB;
  if (!d1) throw new Error('The online database is missing: add the D1 binding "DB" (see docs/CLOUDFLARE.md).');
  return d1;
}

const g = globalThis as unknown as { __sunnyFamily?: FamilyStore };
export function family(): FamilyStore {
  return (g.__sunnyFamily ??= ONLINE ? d1Store(workerDb) : homeStore);
}

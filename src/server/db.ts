import type { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths";
import { STARS_PER_STICKER, STICKERS } from "@/lib/stickers";
import { refreshGames } from "./gameRefresh";

/**
 * node:sqlite is loaded when the home app first opens its database. (The online build runs on Cloudflare Workers,
 * where node:sqlite is only a stub; it never opens this file — its family data is in D1, see family.ts.)
 */
export function openDb(file: string): DatabaseSync {
  const sqlite = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
  return new sqlite.DatabaseSync(file);
}

/** The family's own data (also the online version's D1 database, see family.ts). One statement per entry. */
export const FAMILY_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  `CREATE TABLE IF NOT EXISTS children (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL,
  age INTEGER NOT NULL,
  active_book_id TEXT,
  book_ids TEXT,
  topic_ids TEXT,
  daily_goal_minutes INTEGER NOT NULL DEFAULT 15,
  created_at TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  content_item_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  max_score INTEGER NOT NULL,
  stars INTEGER NOT NULL,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  missed TEXT,
  created_at TEXT NOT NULL
)`,
  "CREATE INDEX IF NOT EXISTS attempts_child ON attempts(child_id, created_at)",
  `CREATE TABLE IF NOT EXISTS stickers (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  code TEXT NOT NULL,
  earned_at TEXT NOT NULL
)`,
];

const SCHEMA = `
${FAMILY_SCHEMA.join(";\n")};

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_hash TEXT,
  title TEXT NOT NULL,
  series TEXT,
  book_type TEXT,
  grade INTEGER,
  page_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  status_detail TEXT,
  meta TEXT,
  assessment TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT
);

CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  title TEXT NOT NULL,
  topic TEXT,
  page_start INTEGER,
  page_end INTEGER,
  extract TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'needs-review'
);
CREATE INDEX IF NOT EXISTS units_book ON units(book_id, ord);

CREATE TABLE IF NOT EXISTS inspiration_topics (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  emoji TEXT NOT NULL,
  description TEXT,
  stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  pictures TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  book_id TEXT,
  unit_id TEXT,
  inspiration_topic_id TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  stage TEXT NOT NULL,
  data TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS items_unit ON content_items(unit_id);
CREATE INDEX IF NOT EXISTS items_topic ON content_items(inspiration_topic_id);

CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  claude_session_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  pack_json TEXT,
  files TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_thread ON chat_messages(thread_id, created_at);
`;

const globalForDb = globalThis as unknown as { __sunnyDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (!globalForDb.__sunnyDb) {
    fs.mkdirSync(path.dirname(paths.dbFile), { recursive: true });
    const d = openDb(paths.dbFile);
    d.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = OFF;");
    d.exec(SCHEMA);
    migrate(d);
    globalForDb.__sunnyDb = d;
  }
  return globalForDb.__sunnyDb;
}

/** Small additive migrations for databases created by earlier versions. */
function migrate(d: DatabaseSync) {
  const cols = (table: string) => (d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  const childCols = cols("children");
  if (childCols.length && !childCols.includes("book_ids")) {
    d.exec("ALTER TABLE children ADD COLUMN book_ids TEXT");
    d.exec("UPDATE children SET book_ids = json_array(active_book_id) WHERE active_book_id IS NOT NULL");
  }
  const msgCols = cols("chat_messages");
  if (msgCols.length && !msgCols.includes("files")) d.exec("ALTER TABLE chat_messages ADD COLUMN files TEXT");
  // (Databases used with the short-lived Gemini option keep an unused chat_messages.model column — harmless.)
  // Inspiration topics are now given to chosen children (Children → Edit). Children keep the live topics they saw before.
  if (childCols.length && !cols("children").includes("topic_ids")) {
    d.exec("ALTER TABLE children ADD COLUMN topic_ids TEXT");
    if (cols("inspiration_topics").length) d.exec("UPDATE children SET topic_ids = (SELECT json_group_array(id) FROM inspiration_topics WHERE status = 'approved')");
  }
  // AI Studio topics can have pictures found on the web or drawn by Claude.
  const topicCols = cols("inspiration_topics");
  if (topicCols.length && !topicCols.includes("pictures")) d.exec("ALTER TABLE inspiration_topics ADD COLUMN pictures TEXT");
  syncStickers(d);
  // 11 mini games: units that still have the old three automatic games get two picked for their topic (once).
  refreshGames(d);
}

/**
 * The sticker album (src/lib/stickers.ts): a child owns the first N album stickers, one row each, in order.
 * Rewrites rows from an older sticker list (or an old backup) to the album's ids in the order they were earned,
 * and adds the stickers the child's stars already pay for. Safe to run any number of times.
 */
export function syncStickers(d: DatabaseSync) {
  if (!d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='stickers'").get()) return;
  const rows = d.prepare("SELECT rowid AS r, child_id AS c, code FROM stickers ORDER BY child_id, earned_at, rowid").all() as { r: number; c: string; code: string }[];
  const have = new Map<string, number>();
  for (const row of rows) {
    const k = have.get(row.c) ?? 0;
    have.set(row.c, k + 1);
    if (k >= STICKERS.length) d.prepare("DELETE FROM stickers WHERE rowid = ?").run(row.r);
    else if (row.code !== STICKERS[k]) d.prepare("UPDATE stickers SET code = ? WHERE rowid = ?").run(STICKERS[k], row.r);
  }
  if (!d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='attempts'").get()) return;
  const stars = d.prepare("SELECT child_id AS c, SUM(stars) AS s FROM attempts GROUP BY child_id").all() as { c: string; s: number }[];
  const at = new Date().toISOString();
  for (const { c, s } of stars) {
    const want = Math.min(STICKERS.length, Math.floor(Number(s) / STARS_PER_STICKER));
    for (let k = Math.min(have.get(c) ?? 0, STICKERS.length); k < want; k++)
      d.prepare("INSERT INTO stickers(id, child_id, code, earned_at) VALUES(?,?,?,?)").run(`st_${c}_${k}_${Date.now().toString(36)}`, c, STICKERS[k], at);
  }
}

/** For tests: a database file with today's tables (as the app creates it). */
export function createDbFile(file: string) {
  const d = openDb(file);
  try {
    d.exec(SCHEMA);
    migrate(d);
  } finally {
    d.close();
  }
}

/** For tests: run the migrations on another database file. */
export function migrateFile(file: string) {
  const d = openDb(file);
  try {
    migrate(d);
  } finally {
    d.close();
  }
}

export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN");
  try {
    const r = fn();
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

export const now = () => new Date().toISOString();
export const newId = (prefix = "") => prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 12);

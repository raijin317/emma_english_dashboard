import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makePdf } from "./helpers/makePdf";

// Isolated folders + fake CLI. Env must be set before the server modules load.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-test-"));
process.env.APP_DB_FILE = path.join(tmp, "app.db");
process.env.BOOKS_DIR = path.join(tmp, "book");
process.env.BOOK_CACHE_DIR = path.join(tmp, "cache");
process.env.BOOK_CONTENT_DIR = path.join(tmp, "content");
process.env.CLAUDE_CLI_PATH = `"${process.execPath}" "${path.resolve("tests/fixtures/fake-claude.mjs")}"`;
const argsLog = path.join(tmp, "args.log");
process.env.FAKE_CLAUDE_ARGS_LOG = argsLog;

let mods: {
  scan: typeof import("@/server/books/scan");
  importer: typeof import("@/server/books/importer");
  repo: typeof import("@/server/repo");
  jobs: typeof import("@/server/claude/jobs");
  bridge: typeof import("@/server/claude/bridge");
  demo: typeof import("@/server/demo");
};

beforeAll(async () => {
  fs.mkdirSync(process.env.BOOKS_DIR!, { recursive: true });
  fs.writeFileSync(path.join(process.env.BOOKS_DIR!, "G2_Fake_StudentBook.pdf"), makePdf(["Cover", "Unit 1 Pets", "cat dog", "Unit 2 Food", "apple milk"]));
  mods = {
    scan: await import("@/server/books/scan"),
    importer: await import("@/server/books/importer"),
    repo: await import("@/server/repo"),
    jobs: await import("@/server/claude/jobs"),
    bridge: await import("@/server/claude/bridge"),
    demo: await import("@/server/demo"),
  };
});

describe("Claude bridge (fake CLI)", () => {
  it("reports status", async () => {
    const s = await mods.bridge.claudeStatus();
    expect(s.ok).toBe(true);
    expect(s.version).toContain("Fake");
  });

  it("streams deltas and returns the session id", async () => {
    let streamed = "";
    const r = await mods.bridge.runClaude({ prompt: "hello", onEvent: (e) => e.kind === "delta" && (streamed += e.text) });
    expect(r.sessionId).toMatch(/^fake-session-/);
    expect(r.text).toContain("What topic");
    expect(streamed).toBe(r.text);
  });

  it("generation jobs block file and shell tools", async () => {
    fs.writeFileSync(argsLog, "");
    await mods.bridge.runClaude({ prompt: "hello" });
    const { argv } = JSON.parse(fs.readFileSync(argsLog, "utf8").trim().split("\n").pop()!);
    expect(argv[argv.indexOf("--tools") + 1]).toBe(""); // no tools at all
    const blocked = argv[argv.indexOf("--disallowedTools") + 1];
    expect(blocked).toContain("Bash");
    expect(blocked).toContain("Write");
    expect(argv).toContain("--restricted");
    expect(argv).toContain("--strict-mcp-config");
    expect(argv).not.toContain("--allowedTools");
  });

  it("book extraction may only read, inside the pages folder", () => {
    const args = mods.bridge.buildArgs({ allowedTools: ["Read"] });
    expect(args[args.indexOf("--tools") + 1]).toBe("Read");
    expect(args[args.indexOf("--allowedTools") + 1]).toBe("Read");
    expect(args[args.indexOf("--disallowedTools") + 1]).not.toContain("Read");
  });

  it("finds the Claude Code bundled with the VS Code extension (newest wins)", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-home-"));
    const exe = process.platform === "win32" ? "claude.exe" : "claude";
    const mk = (ver: string, t: number) => {
      const d = path.join(home, ".vscode", "extensions", `anthropic.claude-code-${ver}-win32-x64`, "resources", "native-binary");
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, exe), "");
      fs.utimesSync(path.join(d, exe), t, t);
      return path.join(d, exe);
    };
    expect(mods.bridge.findBundledClaude(home)).toBeNull();
    mk("2.1.300", 1_700_000_000);
    const newest = mk("2.1.330", 1_800_000_000);
    expect(mods.bridge.findBundledClaude(home)).toBe(newest);
  });

  it("CLAUDE_CLI_PATH wins over auto-detection", () => {
    expect(mods.bridge.resolveCli()).toMatchObject({ source: "env" });
  });

  it("practice pack retries once when the JSON is invalid", async () => {
    const demoUnit = { id: "u", bookId: "b", order: 1, pages: [1, 1] as [number, number], title: "Pets", topic: "pets", vocabulary: [{ word: "cat" }], patterns: [], sentences: [], readings: [], phonics: [], songsChants: [], skills: [], activityTypes: [], longestReadingWords: 0, confidence: 1 };
    const { assessBook } = await import("@/lib/assessment");
    const { DEFAULT_RULES } = await import("@/lib/rules");
    const items = await mods.jobs.claudePracticePack({ unit: demoUnit, earlier: { words: [], patterns: [] }, assessment: assessBook(1, [demoUnit]), childAge: 6, types: ["vocabulary"], rules: DEFAULT_RULES, extra: "FAKE_INVALID_ONCE" });
    expect(items[0].title).toBe("Fixed");
  });

  it("studio chat returns an inspiration pack", async () => {
    const r = await mods.jobs.claudeStudio({ message: "Please create a dinosaur topic", sessionId: null, context: "", history: [] });
    expect(r.pack?.topic.title).toBe("Dinosaurs");
    expect(r.text).toContain("dinosaur set");
    expect(r.packError).toBeNull();
  });
});

describe("book import pipeline", () => {
  it("scans, renders, extracts and assesses a book", async () => {
    const [b] = mods.scan.scanBooks();
    expect(b.fileName).toBe("G2_Fake_StudentBook.pdf");
    expect(mods.scan.gradeHintFromName(b.fileName)).toBe(2);
    expect(mods.scan.gradeHintFromName("Tieng-Anh-1-Global-Success_Sach-Hoc-Sinh.pdf")).toBe(1);
    expect(mods.scan.gradeHintFromName("Tiếng Anh 3 - Lớp 3.pdf")).toBe(3);
    expect(mods.scan.gradeHintFromName("PreK_MyFirstEnglish.pdf")).toBe(0);
    expect(mods.scan.gradeHintFromName("Family and Friends.pdf")).toBeNull();

    const logs: string[] = [];
    const res = await mods.importer.importBook(b, { log: (m) => logs.push(m) });
    expect(res.meta.units.length).toBe(2);
    expect(res.assessment.stage).toBe("early-reader");
    expect(fs.existsSync(path.join(process.env.BOOK_CACHE_DIR!, b.bookId, "pages", "p-005.png"))).toBe(true);
    expect(fs.existsSync(path.join(process.env.BOOK_CACHE_DIR!, b.bookId, "pages", "t-001.png"))).toBe(true);

    const book = mods.repo.getBook(b.bookId)!;
    expect(book.status).toBe("needs-review");
    expect(book.pageCount).toBe(5);
    const units = mods.repo.listUnits(b.bookId);
    expect(units.map((u) => u.extract.vocabulary.length)).toEqual([4, 4]);
    expect(units[0].extract.vocabulary[0].word).toBe("cat");
    // The book's own pictures, sentences and reading texts come along.
    expect(units[0].extract.vocabulary[0].pic).toEqual({ page: 2, box: [0.1, 0.3, 0.15, 0.2] });
    const clamped = units[0].extract.vocabulary[3].pic!.box; // ran off the page → cut at the edge
    expect(clamped[0] + clamped[2]).toBeCloseTo(1, 6);
    expect(units[0].extract.sentences).toContain("I have a cat.");
    expect(units[0].extract.readings[0].text).toContain("It's a cat.");
    expect(logs.at(-1)).toMatch(/^Done/);
  });

  it("re-import is resumable and keeps approved units", async () => {
    const [b] = mods.scan.scanBooks();
    const u1 = mods.repo.listUnits(b.bookId)[0];
    mods.repo.updateUnit(u1.id, { extract: { ...u1.extract, title: "Edited by parent" }, status: "approved" });
    fs.writeFileSync(argsLog, "");
    await mods.importer.importBook(b);
    expect(fs.readFileSync(argsLog, "utf8").trim()).toBe(""); // nothing re-asked
    expect(mods.repo.getUnit(u1.id)!.extract.title).toBe("Edited by parent");
  });

  it("imported units are ready to use right away", () => {
    const [b] = mods.scan.scanBooks();
    expect(mods.repo.listUnits(b.bookId).every((u) => u.status === "approved")).toBe(true);
  });

  it("makes a full learning-resource set for every unit (Claude + offline)", async () => {
    const { generateBookResources, CLAUDE_TYPES, LOCAL_TYPES } = await import("@/server/books/resources");
    const [b] = mods.scan.scanBooks();
    const logs: string[] = [];
    const r = await generateBookResources(b.bookId, { useClaude: true, log: (m) => logs.push(m) });
    expect(r.made).toBe(2);
    expect(mods.repo.getBook(b.bookId)!.status).toBe("ready");
    for (const u of mods.repo.listUnits(b.bookId)) {
      const items = mods.repo.listItems({ unitId: u.id });
      const types = new Set(items.map((i) => i.type));
      for (const t of LOCAL_TYPES) expect(types.has(t)).toBe(true);
      // The fake Claude returns vocabulary + quiz + an invented reading + a listening with a word that isn't in the book;
      // every other type is filled by the offline builder.
      for (const t of CLAUDE_TYPES.filter((t) => t !== "grammar")) expect(types.has(t)).toBe(true);
      expect(items.some((i) => i.createdBy === "claude")).toBe(true);
      expect(items.every((i) => i.status === "approved")).toBe(true);
      // Rule "reading = the book's own text": the invented passage was replaced by the book's text.
      const reading = items.find((i) => i.type === "reading")!;
      expect(reading.createdBy).toBe("parent");
      expect((reading.data as { passage: string }).passage).toBe(u.extract.readings[0].text);
      // Rule "only the book's words": the listening that used "dinosaur" was made from the book instead.
      expect(items.find((i) => i.type === "listening")!.createdBy).toBe("parent");
    }
    expect(logs.some((l) => /not in the book \(dinosaur/.test(l))).toBe(true);

    // Book pictures for the players: by word and by (unique) emoji.
    const { picturesForUnit } = await import("@/server/pictures");
    const pics = picturesForUnit(mods.repo.listUnits(b.bookId)[1]);
    expect(pics["w:apple"]).toMatch(/^\/api\/books\/.+\/crop\?p=4&b=0\.1000,0\.3000,0\.1500,0\.2000&s=400$/);
    expect(pics["w:cat"]).toBeTruthy(); // earlier unit, for review
    expect(pics["e:🍎"]).toBe(pics["w:apple"]);
    // …and none when the parent switches the rule off.
    const rules = mods.repo.getLessonRules().map((r) => (r.id === "book-pictures" ? { ...r, on: false } : r));
    mods.repo.setLessonRules(rules);
    expect(picturesForUnit(mods.repo.listUnits(b.bookId)[1])).toEqual({});
    mods.repo.setLessonRules(rules.map((r) => ({ ...r, on: true })));
    // Second run skips units that already have lessons.
    const again = await generateBookResources(b.bookId, { useClaude: true });
    expect(again.made).toBe(0);
    // Without Claude everything is built offline.
    const offline = await generateBookResources(b.bookId, { useClaude: false, force: true });
    expect(offline.made).toBe(2);
    expect(mods.repo.listItems({ bookId: b.bookId }).every((i) => i.createdBy !== "claude")).toBe(true);
  });

  it("a child can learn several books", async () => {
    const [b] = mods.scan.scanBooks();
    mods.demo.seedDemo();
    const c = mods.repo.saveChild({ name: "Mai", avatar: "🐰", age: 7, bookIds: [b.bookId, mods.demo.DEMO_BOOK_ID] });
    expect(c.bookIds).toEqual([b.bookId, mods.demo.DEMO_BOOK_ID]);
    expect(c.activeBookId).toBe(b.bookId);
    mods.repo.setActiveBook(c.id, mods.demo.DEMO_BOOK_ID);
    expect(mods.repo.getChild(c.id)!.activeBookId).toBe(mods.demo.DEMO_BOOK_ID);
    mods.repo.setActiveBook(c.id, "not-my-book");
    expect(mods.repo.getChild(c.id)!.activeBookId).toBe(mods.demo.DEMO_BOOK_ID);
    // Removing a book removes it from the child too.
    mods.repo.deleteBook(b.bookId);
    expect(mods.repo.getChild(c.id)!.bookIds).toEqual([mods.demo.DEMO_BOOK_ID]);
  });

  it("inspiration topics are given to chosen children only", () => {
    const { repo } = mods;
    const t = repo.createTopic({ title: "Dinosaurs", emoji: "🦖", description: "", stage: "early-reader" });
    const a = repo.saveChild({ name: "An", avatar: "🐻", age: 6, bookIds: [] });
    const b = repo.saveChild({ name: "Bo", avatar: "🐰", age: 8, bookIds: [], topicIds: [t.id, t.id] });
    expect(a.topicIds).toEqual([]); // a new topic is not given to anyone by itself
    expect(b.topicIds).toEqual([t.id]);
    expect(repo.topicChildren(t.id)).toEqual([{ id: b.id, name: "Bo", avatar: "🐰" }]);
    // Saving without topicIds (an older caller) keeps the child's topics.
    expect(repo.saveChild({ ...b, topicIds: undefined, age: 9 }).topicIds).toEqual([t.id]);
    // Deleting the topic takes it away from the children.
    repo.deleteTopic(t.id);
    expect(repo.getChild(b.id)!.topicIds).toEqual([]);
    repo.deleteChild(a.id);
    repo.deleteChild(b.id);
  });

  it("migrates an old database (one active book per child → book list)", async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const file = path.join(tmp, "old.db");
    const old = new DatabaseSync(file);
    old.exec("CREATE TABLE children (id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT NOT NULL, age INTEGER NOT NULL, active_book_id TEXT, daily_goal_minutes INTEGER NOT NULL DEFAULT 15, created_at TEXT NOT NULL)");
    old.exec("INSERT INTO children VALUES ('c1','Bin','🐻',6,'book-1',15,'2026-01-01')");
    old.exec("CREATE TABLE chat_messages (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, pack_json TEXT, created_at TEXT NOT NULL)");
    old.close();
    const { migrateFile } = await import("@/server/db");
    migrateFile(file);
    const after = new DatabaseSync(file);
    const row = after.prepare("SELECT book_ids, topic_ids FROM children WHERE id='c1'").get() as { book_ids: string; topic_ids: string | null };
    expect(JSON.parse(row.book_ids)).toEqual(["book-1"]);
    expect(row.topic_ids).toBeNull(); // no topics table yet → no topics
    // AI Studio messages can now carry attached files.
    expect((after.prepare("PRAGMA table_info(chat_messages)").all() as { name: string }[]).map((c) => c.name)).toContain("files");
    after.close();
  });

  it("sticker album: stickers come in album order, a full page wins its trophy (= level)", async () => {
    const { repo } = mods;
    const { ALBUM, STICKERS, albumState } = await import("@/lib/stickers");
    expect(new Set(STICKERS).size).toBe(STICKERS.length); // ids are unique
    expect(ALBUM.every((p) => p.stickers.length === 8)).toBe(true);
    expect(ALBUM.map((p) => p.id)).toEqual(expect.arrayContaining(["land", "sea", "bugs", "vehicles", "robots", "boats", "space"]));
    const [item] = repo.listItems({ bookId: mods.demo.DEMO_BOOK_ID });
    const c = repo.saveChild({ name: "Kim", avatar: "🐯", age: 6, bookIds: [] });
    const play = (stars: number) => repo.recordAttempt({ childId: c.id, itemId: item.id, score: stars === 3 ? 10 : stars === 2 ? 6 : 1, maxScore: 10, durationSec: 30, missed: [] });
    let last = play(3);
    for (let k = 0; k < 12; k++) last = play(3); // 39 stars → 7 stickers
    expect(repo.childStats(c.id).stickers).toEqual(STICKERS.slice(0, 7));
    expect(last.newTrophies).toEqual([]);
    last = play(3); // 42 stars → the 8th sticker completes "Animals on land"
    expect(last.newStickers).toEqual([STICKERS[7]]);
    expect(last.newTrophies).toEqual(["land"]);
    expect(last.level).toBe(1);
    const stats = repo.childStats(c.id);
    expect(stats.trophies).toEqual(["land"]);
    expect(stats.level).toBe(1);
    expect(albumState(stats.stickers.length).current).toBe(1); // now filling "Under the sea"
    repo.deleteChild(c.id);
  });

  it("migration: the old sticker list moves into the album, and missing stickers are added", async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const { STICKERS } = await import("@/lib/stickers");
    const file = path.join(tmp, "old-stickers.db");
    const old = new DatabaseSync(file);
    old.exec("CREATE TABLE stickers (id TEXT PRIMARY KEY, child_id TEXT NOT NULL, code TEXT NOT NULL, earned_at TEXT NOT NULL)");
    old.exec("CREATE TABLE attempts (id TEXT PRIMARY KEY, child_id TEXT NOT NULL, content_item_id TEXT NOT NULL, score INTEGER, max_score INTEGER, stars INTEGER, duration_sec INTEGER, missed TEXT, created_at TEXT)");
    ["🦁", "🐼", "🦄"].forEach((code, k) => old.prepare("INSERT INTO stickers VALUES (?,?,?,?)").run(`s${k}`, "c1", code, `2026-01-0${k + 1}`));
    for (let k = 0; k < 18; k++) old.prepare("INSERT INTO attempts VALUES (?,?,?,?,?,?,?,?,?)").run(`a${k}`, "c1", "i1", 10, 10, 3, 30, "[]", "2026-01-01"); // 54 stars → 10 stickers
    old.close();
    const { migrateFile } = await import("@/server/db");
    migrateFile(file);
    migrateFile(file); // twice is the same
    const after = new DatabaseSync(file);
    const codes = (after.prepare("SELECT code FROM stickers WHERE child_id='c1' ORDER BY earned_at, rowid").all() as { code: string }[]).map((r) => r.code);
    expect(codes).toEqual(STICKERS.slice(0, 10));
    after.close();
  });

  it("migration: children keep the live inspiration topics they saw before topics were given per child", async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const file = path.join(tmp, "old-topics.db");
    const old = new DatabaseSync(file);
    old.exec("CREATE TABLE children (id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT NOT NULL, age INTEGER NOT NULL, active_book_id TEXT, book_ids TEXT, daily_goal_minutes INTEGER NOT NULL DEFAULT 15, created_at TEXT NOT NULL)");
    old.exec("INSERT INTO children VALUES ('c1','Bin','🐻',6,NULL,'[]',15,'2026-01-01')");
    old.exec("CREATE TABLE inspiration_topics (id TEXT PRIMARY KEY, title TEXT, emoji TEXT, description TEXT, stage TEXT, status TEXT, created_at TEXT)");
    old.exec("INSERT INTO inspiration_topics VALUES ('tp_live','Sea','🐠','','early-reader','approved','2026-01-01'), ('tp_draft','Zoo','🦁','','early-reader','draft','2026-01-01')");
    old.close();
    const { migrateFile } = await import("@/server/db");
    migrateFile(file);
    const after = new DatabaseSync(file);
    const row = after.prepare("SELECT topic_ids FROM children WHERE id='c1'").get() as { topic_ids: string };
    expect(JSON.parse(row.topic_ids)).toEqual(["tp_live"]);
    after.close();
  });

  it("demo seed creates an approved, valid book", async () => {
    expect(mods.demo.seedDemo()).toBe(false); // already seeded by the multi-book test
    const items = mods.repo.listItems({ bookId: mods.demo.DEMO_BOOK_ID });
    expect(items.length).toBeGreaterThan(15);
    const { validateItemData } = await import("@/lib/schemas/content");
    for (const it of items) expect(validateItemData(it.type, it.data).success).toBe(true);
    expect(mods.demo.seedDemo()).toBe(false);
  });
});

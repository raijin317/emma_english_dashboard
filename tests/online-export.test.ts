import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createCanvas } from "@napi-rs/canvas";

// Isolated folders. Env must be set before the server modules load.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-online-"));
const env = {
  APP_DB_FILE: path.join(tmp, "app.db"),
  BOOK_CACHE_DIR: path.join(tmp, "cache"),
  TOPICS_DIR: path.join(tmp, "topics"),
  STUDIO_DIR: path.join(tmp, "studio"),
  TTS_CACHE_DIR: path.join(tmp, "tts"),
  ONLINE_OUT_DIR: path.join(tmp, "out"),
};
Object.assign(process.env, env);

const BOOK = "test-book-1a2b3c";
const PIC = { page: 1, box: [0.1, 0.1, 0.5, 0.5] as [number, number, number, number] };

function floatWav(seconds: number) {
  const n = Math.round(24000 * seconds);
  const b = Buffer.alloc(44 + n * 4);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(36 + n * 4, 4);
  b.write("WAVEfmt ", 8, "ascii");
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(3, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(24000, 24);
  b.writeUInt32LE(96000, 28);
  b.writeUInt16LE(4, 32);
  b.writeUInt16LE(32, 34);
  b.write("data", 36, "ascii");
  b.writeUInt32LE(n * 4, 40);
  for (let k = 0; k < n; k++) b.writeFloatLE(0.3 * Math.sin(k / 9), 44 + k * 4);
  return b;
}

async function setUp() {
  const repo = await import("@/server/repo");
  const { pageFile, thumbFile } = await import("@/server/paths");
  const { ttsFile } = await import("@/server/tts/cache");
  const { speechSpeed } = await import("@/lib/voices");
  const { commonSpeakables, speechUnits } = await import("@/lib/speakables");

  repo.upsertBook({ id: BOOK, fileName: "Book.pdf", title: "My Book", status: "ready", pageCount: 2, grade: 2 });
  const unit = (n: number) => ({
    id: `${BOOK}-u0${n}`,
    bookId: BOOK,
    order: n,
    pages: [1, 2] as [number, number],
    title: `Unit ${n}`,
    topic: "toys",
    vocabulary: [{ word: "ball", emoji: "⚽", pic: PIC }, { word: "car", emoji: "🚗" }, { word: "kite", emoji: "🪁" }],
    patterns: [{ text: "It's a ___.", function: "naming" }],
    sentences: [],
    readings: [],
    phonics: [],
    songsChants: [],
    skills: [],
    activityTypes: [],
    longestReadingWords: 10,
    confidence: 1,
    notes: "",
  });
  repo.upsertUnit(unit(1), "approved");
  repo.upsertUnit(unit(2), "needs-review"); // not approved: not published
  const item = (unitId: string, status: "approved" | "draft", title: string) =>
    repo.createItem({ source: "book", bookId: BOOK, unitId, inspirationTopicId: null, type: "vocabulary", title, status, stage: "early-reader", data: { words: [{ word: "ball", emoji: "⚽" }, { word: "car", emoji: "🚗" }, { word: "kite", emoji: "🪁" }] }, createdBy: "parent" });
  const live = item(`${BOOK}-u01`, "approved", "Toy words");
  item(`${BOOK}-u01`, "draft", "Draft words");

  const t = repo.createTopic({ title: "Fruit", emoji: "🍎", description: "Fruit", stage: "early-reader" });
  repo.createItem({ source: "inspiration", bookId: null, unitId: null, inspirationTopicId: t.id, type: "vocabulary", title: "Fruit words", status: "draft", stage: "early-reader", data: { words: [{ word: "apple", emoji: "🍎" }, { word: "pear", emoji: "🍐" }, { word: "plum", emoji: "🟣" }] }, createdBy: "claude" });
  repo.updateTopic(t.id, { status: "approved" });
  const drawn = path.join(env.TOPICS_DIR, t.id, "apple-x1", "ai.png");
  fs.mkdirSync(path.dirname(drawn), { recursive: true });
  fs.writeFileSync(drawn, Buffer.from(await createCanvas(8, 8).encode("png")));
  repo.setTopicPictures(t.id, { apple: { word: "apple", slug: "apple-x1", file: "ai.png", source: "ai", v: 1 } });
  repo.createTopic({ title: "Draft topic", emoji: "🧪", description: "", stage: "early-reader" }); // a draft: not published

  // The rendered page (for the word picture) and its thumbnail (the cover).
  fs.mkdirSync(path.dirname(pageFile(BOOK, 1)), { recursive: true });
  const page = createCanvas(200, 300);
  page.getContext("2d").fillRect(20, 30, 100, 150);
  fs.writeFileSync(pageFile(BOOK, 1), Buffer.from(await page.encode("png")));
  fs.writeFileSync(thumbFile(BOOK, 1), Buffer.from(await createCanvas(50, 75).encode("png")));

  // One clip made by the voice engine at the family's speed (0.85 by default); everything else is "not made yet".
  // (Clips are per part: "Amazing! Great job!" is played as "Amazing!" + "Great job!".)
  const text = speechUnits(commonSpeakables())[0].text;
  const wav = ttsFile(text, "af_heart", speechSpeed(0.85, false));
  fs.mkdirSync(path.dirname(wav), { recursive: true });
  fs.writeFileSync(wav, floatWav(0.5));
  // A file from an earlier export that no lesson uses any more.
  const stale = path.join(env.ONLINE_OUT_DIR, "public", "online", "voice", "af_heart", "old.mp3");
  fs.mkdirSync(path.dirname(stale), { recursive: true });
  fs.writeFileSync(stale, "x");
  return { liveId: live.id, topicId: t.id, text, stale };
}

function runExport() {
  const tsx = path.resolve("node_modules/tsx/dist/cli.mjs");
  const r = spawnSync(process.execPath, [tsx, "scripts/online-export.ts", "--json"], { env: { ...process.env, ...env }, encoding: "utf8" });
  const events = r.stdout.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l) as { type: string; msg: string } & Record<string, unknown>);
  return { code: r.status, events, stderr: r.stderr };
}

describe("npm run online:export", () => {
  it("publishes only live lessons, their pictures and voice clips, and removes old files", async () => {
    const s = await setUp();
    const r = runExport();
    expect(r.code, r.stderr + JSON.stringify(r.events.filter((e) => e.type === "error"))).toBe(0);
    const done = r.events.find((e) => e.type === "done")!;
    expect(done).toMatchObject({ books: 1, items: 2, topics: 1, clips: 1 });
    expect(Number(done.missing)).toBeGreaterThan(10);

    const out = path.join(env.ONLINE_OUT_DIR, "public", "online");
    const snap = JSON.parse(fs.readFileSync(path.join(env.ONLINE_OUT_DIR, "content", "online", "snapshot.json"), "utf8"));
    expect(snap.books.map((b: { id: string }) => b.id)).toEqual([BOOK]);
    expect(snap.books[0].unitCount).toBeUndefined();
    expect(snap.units.map((u: { id: string }) => u.id)).toEqual([`${BOOK}-u01`]);
    expect(snap.items.map((i: { title: string }) => i.title).sort()).toEqual(["Fruit words", "Toy words"]);
    expect(snap.topics.map((t: { title: string; pictures: object }) => [t.title, Object.keys(t.pictures)])).toEqual([["Fruit", ["apple"]]]);
    expect(snap.voice).toMatchObject({ voice: "af_heart", childRate: 0.85, clips: 1 });
    expect(snap.lessonRules.length).toBeGreaterThanOrEqual(4);

    // Files under the names the app computes online.
    const { cropKey, ttsKey } = await import("@/lib/assetKeys");
    const { CROP_SIZES } = await import("@/lib/pictures");
    expect(fs.existsSync(path.join(out, "books", BOOK, "cover.png"))).toBe(true);
    for (const size of CROP_SIZES) expect(fs.existsSync(path.join(out, "books", BOOK, "crops", `${cropKey(PIC.page, PIC.box, size)}.webp`))).toBe(true);
    expect(fs.existsSync(path.join(out, "topics", s.topicId, "apple-x1", "ai.png"))).toBe(true);
    const mp3 = path.join(out, "voice", "af_heart", `${ttsKey(s.text, 0.85)}.mp3`);
    expect(fs.readFileSync(mp3)[0]).toBe(0xff);
    expect(fs.existsSync(s.stale)).toBe(false);

    // The online version reads this snapshot the way the routes expect.
    vi.doMock("../content/online/snapshot.json", () => ({ default: snap }));
    vi.resetModules();
    const online = await import("@/server/snapshot");
    expect(online.listBooks()[0]).toMatchObject({ id: BOOK, unitCount: 1, approvedUnits: 1, readyUnits: 1 });
    expect(online.listUnits(BOOK)[0]).toMatchObject({ itemCount: 1, approvedItemCount: 1 });
    expect(online.getItem(s.liveId)?.title).toBe("Toy words");
    expect(online.listItems({ topicId: s.topicId }).map((i) => i.title)).toEqual(["Fruit words"]);
    expect(online.listTopics("approved")[0]).toMatchObject({ title: "Fruit", itemCount: 1 });
    expect(online.getTopicPictures(s.topicId).apple.file).toBe("ai.png");
    expect(online.getTopic(s.topicId)).not.toHaveProperty("pictures");

    // A second run reuses the files (nothing new to encode).
    const again = runExport().events.find((e) => e.type === "done")!;
    expect(again).toMatchObject({ clips: 1 });
    expect(again.msg).not.toMatch(/removed/);
  });
});

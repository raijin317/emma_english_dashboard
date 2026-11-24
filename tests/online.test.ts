import { describe, expect, it, vi } from "vitest";

// The published voice (content/online/snapshot.json changes with every export): each test sets it.
const published = vi.hoisted(() => ({ voice: null as null | { voice: string; childRate: number; clips: number; missing: number } }));
vi.mock("@/server/snapshot", async (original) => ({ ...(await original<typeof import("@/server/snapshot")>()), snapshotVoice: () => published.voice }));
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { sha1Hex } from "@/lib/sha1";
import { cropKey, ttsKey } from "@/lib/assetKeys";
import { PLAN_VERSION, speechPlan } from "@/lib/speechPlan";
import { normalizeSpeech } from "@/lib/voices";
import { readWav, wavToMp3 } from "@/server/tts/mp3";
import { albumStickers, d1Store, type D1Like, type D1Statement } from "@/server/family";
import { STICKERS } from "@/lib/stickers";

const nodeSha1 = (s: string) => createHash("sha1").update(s).digest("hex");

/** D1's API over a node:sqlite file (batch = one transaction, like D1). */
function fakeD1(file: string): D1Like {
  const db = new DatabaseSync(file);
  const stmt = (sql: string, args: unknown[] = []): D1Statement & { exec: () => unknown } => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    all: async <T,>() => ({ results: db.prepare(sql).all(...(args as never[])) as T[] }),
    first: async <T,>() => (db.prepare(sql).get(...(args as never[])) as T) ?? null,
    run: async () => db.prepare(sql).run(...(args as never[])),
    exec: () => db.prepare(sql).run(...(args as never[])),
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (list) => {
      db.exec("BEGIN");
      try {
        const r = list.map((s) => (s as ReturnType<typeof stmt>).exec());
        db.exec("COMMIT");
        return r;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

function wav(samples: Float32Array | Int16Array, rate = 24000) {
  const float = samples instanceof Float32Array;
  const bytes = samples.length * (float ? 4 : 2);
  const b = Buffer.alloc(44 + bytes);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(36 + bytes, 4);
  b.write("WAVE", 8, "ascii");
  b.write("fmt ", 12, "ascii");
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(float ? 3 : 1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * (float ? 4 : 2), 28);
  b.writeUInt16LE(float ? 4 : 2, 32);
  b.writeUInt16LE(float ? 32 : 16, 34);
  b.write("data", 36, "ascii");
  b.writeUInt32LE(bytes, 40);
  samples.forEach((v, k) => (float ? b.writeFloatLE(v, 44 + k * 4) : b.writeInt16LE(v, 44 + k * 2)));
  return b;
}

describe("online version: file names shared by home and online", () => {
  it("sha1Hex is the same as Node's SHA-1", () => {
    for (const s of ["", "a", "abc", "Hello, friend!", "Xin chào 👋 — “quotes”\nline 2", "x".repeat(55), "y".repeat(56), "z".repeat(64), "w".repeat(1000)]) expect(sha1Hex(s)).toBe(nodeSha1(s));
  });

  it("voice clip keys are the ones the home cache already uses", () => {
    // The key the app used before (src/server/tts/cache.ts), so the existing WAVs are found and exported.
    const old = (text: string, speed: number) => {
      const n = normalizeSpeech(text);
      const plan = speechPlan(n);
      const style = plan.length === 1 && plan[0].say === n ? "" : `${PLAN_VERSION}|`;
      return nodeSha1(`${style}${speed.toFixed(2)}|${n}`).slice(0, 20);
    };
    for (const [t, s] of [["ball", 0.75], ["  It's a   ball. ", 0.56], ["Hi. I'm Mai.\nNice to meet you!", 0.85], ["Mai: Hello!\nBen: Hi!", 0.6]] as const) expect(ttsKey(t, s)).toBe(old(t, s));
  });

  it("book picture keys match the crop cache", () => {
    const old = (page: number, box: number[], size: number) => nodeSha1(`${page}|${box.map((n) => n.toFixed(4)).join(",")}|${size}`).slice(0, 16);
    expect(cropKey(12, [0.1, 0.2, 0.33333, 0.25], 400)).toBe(old(12, [0.1, 0.2, 0.33333, 0.25], 400));
    expect(cropKey(3, [0, 0, 1, 1], 9999)).toBe(old(3, [0, 0, 1, 1], 800)); // sizes are clamped like the route does
  });
});

describe("online version: voice as MP3", () => {
  it("reads the voice engine's float WAV and 16-bit WAV, and makes a smaller MP3", async () => {
    const sine = Float32Array.from({ length: 24000 }, (_, k) => 0.5 * Math.sin((2 * Math.PI * 440 * k) / 24000));
    const f = readWav(wav(sine));
    expect(f.rate).toBe(24000);
    expect(f.samples[100]).toBeCloseTo(sine[100], 5);
    const pcm = Int16Array.from(sine, (v) => Math.round(v * 32767));
    expect(readWav(wav(pcm)).samples[100]).toBeCloseTo(sine[100], 3);
    const mp3 = await wavToMp3(wav(sine));
    // MPEG frame sync at the start, about 6 KB for one second (the WAV is 96 KB).
    expect(mp3[0]).toBe(0xff);
    expect(mp3[1] & 0xe0).toBe(0xe0);
    expect(mp3.length).toBeGreaterThan(4000);
    expect(mp3.length).toBeLessThan(9000);
    expect(() => readWav(Buffer.from("not a wav"))).toThrow(/not a WAV/);
  });
});

describe("online version: family data in D1", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-d1-"));
  const store = d1Store(async () => fakeD1(path.join(tmp, "d1.sqlite")));

  it("creates its tables on first use and keeps settings and the PIN", async () => {
    // No voice published: the browser voice is used.
    published.voice = null;
    expect(await store.settings()).toMatchObject({ ttsEngine: "browser", soundOn: true, breakMinutes: 20, hasPin: false, topicPictures: "off" });
    // Published: the natural voice and speed are the ones the clips were made with at home, whatever is stored.
    published.voice = { voice: "am_puck", childRate: 0.75, clips: 10, missing: 0 };
    await store.setSettings({ ttsVoice: "af_sky", childRate: "1.1" });
    expect(await store.settings()).toMatchObject({ ttsEngine: "natural", ttsVoice: "am_puck", childRate: 0.75 });
    await store.setSettings({ ttsEngine: "browser" });
    expect((await store.settings()).ttsEngine).toBe("browser");
    expect(await store.checkPin("1234")).toBe(true); // no PIN yet
    await store.setPin("2468");
    expect(await store.checkPin("1234")).toBe(false);
    expect(await store.checkPin("2468")).toBe(true);
    await store.setSettings({ soundOn: "0", breakMinutes: "30" });
    expect(await store.settings()).toMatchObject({ soundOn: false, breakMinutes: 30, hasPin: true });
  });

  it("saves children, their attempts, stickers and stats", async () => {
    const c = await store.saveChild({ name: "Mai", avatar: "🐻", age: 6, bookIds: ["b1", "b2"], topicIds: ["t1"], activeBookId: "b2" });
    expect(c).toMatchObject({ name: "Mai", bookIds: ["b1", "b2"], activeBookId: "b2", topicIds: ["t1"], dailyGoalMinutes: 15 });
    // An edit that doesn't send topics keeps them.
    expect((await store.saveChild({ id: c.id, name: "Mai Anh", avatar: "🐼", age: 7, bookIds: ["b1"] })).topicIds).toEqual(["t1"]);
    await store.setActiveBook(c.id, "zzz"); // not one of her books: ignored
    expect((await store.getChild(c.id))?.activeBookId).toBe("b1");
    expect(await store.topicChildren("t1")).toEqual([{ id: c.id, name: "Mai Anh", avatar: "🐼" }]);

    const first = await store.recordAttempt({ childId: c.id, itemId: "i1", score: 9, maxScore: 10, durationSec: 120, missed: ["cat"] });
    expect(first).toMatchObject({ stars: 3, newStickers: [] });
    const second = await store.recordAttempt({ childId: c.id, itemId: "i2", score: 3, maxScore: 5, durationSec: 60, missed: ["cat", "dog"] });
    // 3 + 2 stars = the first sticker of the album.
    expect(second).toMatchObject({ stars: 2, newStickers: [STICKERS[0]] });
    const stats = await store.childStats(c.id);
    expect(stats).toMatchObject({ totalStars: 5, attempts: 2, stickers: [STICKERS[0]], minutesToday: 3, completedItemIds: ["i1", "i2"] });
    expect(stats.weakWords[0]).toEqual({ word: "cat", misses: 2 });
  });

  it("exports the family part and restores a backup made at home", async () => {
    const dump = await store.exportAll();
    expect(Object.keys(dump.tables).sort()).toEqual(["attempts", "children", "settings", "stickers"]);
    // A home backup: other tables and home-only settings are ignored; an old sticker list is moved into the album.
    await store.importAll({
      tables: {
        settings: [{ key: "pinHash", value: "x" }, { key: "lessonRules", value: "[]" }, { key: "soundOn", value: "1" }],
        children: [{ id: "ch_home", name: "Ben", avatar: "🦊", age: 5, active_book_id: null, book_ids: "[]", topic_ids: "[]", daily_goal_minutes: 10, created_at: "2026-01-01T00:00:00.000Z" }],
        attempts: Array.from({ length: 4 }, (_, k) => ({ id: `a${k}`, child_id: "ch_home", content_item_id: "i1", score: 1, max_score: 1, stars: 3, duration_sec: 30, missed: "[]", created_at: `2026-01-0${k + 1}T00:00:00.000Z` })),
        stickers: [{ id: "s1", child_id: "ch_home", code: "old-code", earned_at: "2026-01-02T00:00:00.000Z" }],
        books: [{ id: "should-not-matter" }],
      },
    });
    expect((await store.listChildren()).map((c) => c.name)).toEqual(["Ben"]);
    expect(await store.getSetting("lessonRules")).toBeNull();
    expect(await store.getSetting("pinHash")).toBe("x");
    // 12 stars pay for 2 stickers; the old one becomes the first album sticker.
    expect((await store.childStats("ch_home")).stickers).toEqual([STICKERS[0], STICKERS[1]]);
    await store.deleteChild("ch_home");
    expect(await store.listChildren()).toEqual([]);
    expect((await store.childStats("ch_home")).attempts).toBe(0);
  });

  it("albumStickers keeps earned order and caps at the album size", () => {
    const rows = albumStickers(
      [
        { id: "b", child_id: "c", code: "x", earned_at: "2026-02-01" },
        { id: "a", child_id: "c", code: "y", earned_at: "2026-01-01" },
      ],
      [{ child_id: "c", stars: 10_000 }],
    );
    expect(rows.length).toBe(STICKERS.length);
    expect(rows.slice(0, 2).map((r) => [r.id, r.code])).toEqual([
      ["a", STICKERS[0]],
      ["b", STICKERS[1]],
    ]);
  });
});

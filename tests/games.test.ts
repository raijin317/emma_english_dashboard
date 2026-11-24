import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { GAMES, GAME_KINDS, gameHistory, gameItem, gameItems, isPlural, pickGames, playableGames } from "@/lib/games";
import { buildQuickPack } from "@/lib/quickPack";
import { PROFILES } from "@/lib/assessment";
import { GameData, type GameKind } from "@/lib/schemas/content";

const w = (list: string) => list.split(",").map((word, k) => ({ word: word.trim(), emoji: ["🐟", "🦀", "🐚", "🐙", "🐳", "⭐"][k % 6] }));
const sea = w("fish, crab, shell, octopus, whale");
const food = w("apple, banana, milk, bread, cake");
const cars = w("car, bus, bike, train, taxi");

describe("mini games", () => {
  it("every game kind is valid game data with any word list", () => {
    for (const kind of GAME_KINDS) {
      const it = gameItem(kind, food, { seed: "x" });
      if (kind === "sort") expect(it).toBeNull(); // needs categories
      else expect(GameData.safeParse(it!.data).success, kind).toBe(true);
    }
  });

  it("only offers games a child can play: no spelling/reading games for pre-readers", () => {
    const pre = playableGames(food, PROFILES["pre-reader"]);
    expect(pre).not.toContain("spelling");
    expect(pre).not.toContain("rocket");
    expect(pre).not.toContain("sort");
    expect(playableGames(food, PROFILES["early-reader"])).toEqual(expect.arrayContaining(["spelling", "rocket"]));
    expect(playableGames(food.slice(0, 2), PROFILES["early-reader"])).toEqual([]);
  });

  it("picks two different games that fit the topic", () => {
    const profile = PROFILES["early-reader"];
    const atSea = pickGames({ text: "At the seaside", words: sea, profile, seed: "u1" });
    expect(atSea).toHaveLength(2);
    expect(atSea).toContain("fishing");
    expect(pickGames({ text: "In the kitchen", words: food, profile, seed: "u2" })).toContain("feed");
    expect(pickGames({ text: "At the bus stop", words: cars, profile, seed: "u3" })).toContain("traffic");
    // The two games play differently when possible.
    const [a, b] = atSea;
    expect(GAMES[a as GameKind].family).not.toBe(GAMES[b as GameKind].family);
  });

  it("avoids the games of the units just before, and spreads games over a book", () => {
    const profile = PROFILES["early-reader"];
    const units = ["At school", "My family", "My toys", "At the park", "In the classroom", "My body", "Pets", "My house", "Fruit", "Colors"];
    const groups: GameKind[][] = [];
    for (const [k, title] of units.entries()) groups.push(pickGames({ text: title, words: food, profile, seed: `unit${k}`, ...gameHistory(groups) }));
    for (let k = 1; k < groups.length; k++) expect(groups[k].some((g) => groups[k - 1].includes(g)), `unit ${k}`).toBe(false);
    expect(new Set(groups.flat()).size).toBeGreaterThanOrEqual(8);
  });

  it("the quick pack has exactly two games, chosen for the unit", () => {
    const unit = { title: "Under the sea", topic: "sea animals", vocabulary: sea, patterns: [{ text: "I see a ___.", function: "" }] };
    const games = buildQuickPack(unit, PROFILES["early-reader"], { seed: "q" }).filter((i) => i.type === "game");
    expect(games).toHaveLength(2);
    expect(games.map((g) => (g.data as { game: string }).game)).toContain("fishing");
    // Not the same pair as the unit before.
    const after = buildQuickPack(unit, PROFILES["early-reader"], { seed: "q", games: gameHistory([games.map((g) => (g.data as { game: GameKind }).game)]) }).filter((i) => i.type === "game");
    expect(after.some((g) => games.some((x) => x.title === g.title))).toBe(false);
  });

  it("builds game word lists that suit the game", () => {
    expect(gameItem("spelling", w("ice cream, cat, dog, sun"), { seed: "s" })!.data.words.map((x) => x.word)).toEqual(["cat", "dog", "sun"]);
    expect(gameItem("memory", sea, { seed: "s", young: true })!.data.words).toHaveLength(4);
    expect(gameItems({ text: "x", words: sea, profile: PROFILES["pre-reader"], seed: "s", count: 2 })).toHaveLength(2);
  });

  it("says 'Where are the shoes?' but 'Where is the bus?'", () => {
    expect(["shoes", "pants", "blue jeans", "kiwis"].every(isPlural)).toBe(true);
    expect(["bus", "glass", "octopus", "Christmas", "dress", "cat"].some(isPlural)).toBe(false);
  });
});

describe("games v2 update of existing units", () => {
  it("replaces the old automatic three games with two picked games, keeps edited ones, tops topics up", async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sunny-games-")), "old.db");
    const { createDbFile, migrateFile } = await import("@/server/db");
    createDbFile(file); // a fresh database (nothing to update yet); then old-style units are added
    const d = new DatabaseSync(file);
    d.exec("DELETE FROM settings WHERE key = 'games_v2'");
    const at = "2026-11-01T00:00:00.000Z";
    d.prepare("INSERT INTO books(id, file_name, title, status, assessment) VALUES('b1','b.pdf','Book','ready',?)").run(JSON.stringify({ stage: "early-reader", generationProfile: PROFILES["early-reader"] }));
    const units = [
      ["u1", 1, "At the seaside", sea],
      ["u2", 2, "In the kitchen", food],
      ["u3", 3, "At the bus stop", cars],
    ] as const;
    const item = d.prepare("INSERT INTO content_items(id, source, book_id, unit_id, inspiration_topic_id, type, title, status, stage, data, created_by, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)");
    for (const [id, ord, title, words] of units) {
      d.prepare("INSERT INTO units(id, book_id, ord, title, extract, status) VALUES(?,?,?,?,?,'approved')").run(id, "b1", ord, title, JSON.stringify({ vocabulary: words, patterns: [] }));
      for (const [game, label] of [["memory", "Memory match"], ["balloon", "Balloon pop"], ["spelling", "Spelling bee"]])
        item.run(`${id}-${game}`, "book", "b1", id, null, "game", label, "approved", "early-reader", JSON.stringify({ game, words }), "parent", at, id === "u3" && game === "memory" ? "2026-11-02T00:00:00.000Z" : at);
      item.run(`${id}-quiz`, "book", "b1", id, null, "quiz", "Quiz", "approved", "early-reader", JSON.stringify({ questions: [] }), "parent", at, at);
    }
    d.prepare("INSERT INTO inspiration_topics(id, title, emoji, description, stage, status, created_at) VALUES('t1','At the Restaurant','🍽️','Ordering food','early-reader','approved',?)").run(at);
    item.run("t1-voc", "inspiration", null, null, "t1", "vocabulary", "Words", "approved", "early-reader", JSON.stringify({ words: food }), "claude", at, at);
    item.run("t1-mem", "inspiration", null, null, "t1", "game", "Food memory", "approved", "early-reader", JSON.stringify({ game: "memory", words: food }), "claude", at, at);
    d.close();

    migrateFile(file);
    const db = new DatabaseSync(file, { readOnly: true });
    const games = (unit: string) => (db.prepare("SELECT data FROM content_items WHERE unit_id = ? AND type = 'game'").all(unit) as { data: string }[]).map((r) => JSON.parse(r.data).game as string);
    expect(games("u1")).toHaveLength(2);
    expect(games("u1")).toContain("fishing");
    expect(games("u2")).toHaveLength(2);
    expect(games("u2")).toContain("feed");
    expect(games("u2").some((g) => games("u1").includes(g))).toBe(false);
    // The parent edited a game in unit 3: its games are kept as they were.
    expect(games("u3").sort()).toEqual(["balloon", "memory", "spelling"]);
    // Other items are untouched.
    expect(db.prepare("SELECT COUNT(*) n FROM content_items WHERE type = 'quiz'").get()).toEqual({ n: 3 });
    // The topic now has two games (its own memory game + one that fits a restaurant), live like the topic.
    const topic = db.prepare("SELECT data, status FROM content_items WHERE inspiration_topic_id = 't1' AND type = 'game'").all() as { data: string; status: string }[];
    expect(topic.map((t) => JSON.parse(t.data).game)).toEqual(expect.arrayContaining(["memory", "feed"]));
    expect(topic.every((t) => t.status === "approved")).toBe(true);
    db.close();
    // Runs once only.
    migrateFile(file);
    const again = new DatabaseSync(file, { readOnly: true });
    expect(again.prepare("SELECT COUNT(*) n FROM content_items WHERE type = 'game'").get()).toEqual({ n: 2 + 2 + 3 + 2 });
    again.close();
  });
});

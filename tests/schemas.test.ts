import { describe, expect, it } from "vitest";
import { GameData, PackItem, QuizQuestion, WorksheetSection, InspirationPack } from "@/lib/schemas/content";
import { buildQuickPack } from "@/lib/quickPack";
import { PROFILES, STAGES } from "@/lib/assessment";

const unit = {
  title: "My Toys",
  topic: "toys",
  vocabulary: [
    { word: "ball", emoji: "⚽" },
    { word: "car", emoji: "🚗" },
    { word: "doll", emoji: "🪆" },
    { word: "kite", emoji: "🪁" },
    { word: "robot", emoji: "🤖" },
    { word: "teddy bear", emoji: "🧸" },
  ],
  patterns: [{ text: "I have a ___.", function: "having" }],
};

describe("quick pack", () => {
  for (const stage of STAGES) {
    it(`builds valid items for ${stage}`, () => {
      const items = buildQuickPack(unit, PROFILES[stage], { seed: stage });
      expect(items.length).toBeGreaterThanOrEqual(7);
      for (const it of items) {
        const r = PackItem.safeParse(it);
        if (!r.success) throw new Error(`${it.type} invalid: ${JSON.stringify(r.error.issues)}`);
      }
      const types = new Set(items.map((i) => i.type));
      expect(types.has("vocabulary") && types.has("quiz") && types.has("worksheet") && types.has("lessonPlan") && types.has("test")).toBe(true);
    });
  }

  it("is deterministic for the same seed", () => {
    expect(buildQuickPack(unit, PROFILES["early-reader"], { seed: "a" })).toEqual(buildQuickPack(unit, PROFILES["early-reader"], { seed: "a" }));
  });

  it("returns nothing when a unit has fewer than 3 words", () => {
    expect(buildQuickPack({ ...unit, vocabulary: unit.vocabulary.slice(0, 2) }, PROFILES["early-reader"], { seed: "a" })).toEqual([]);
  });

  it("pre-readers get no writing tasks", () => {
    const items = buildQuickPack(unit, PROFILES["pre-reader"], { seed: "x" });
    const ws = items.find((i) => i.type === "worksheet")!;
    expect(JSON.stringify(ws)).not.toContain('"trace"');
    expect(items.some((i) => i.type === "game" && i.data.game === "spelling")).toBe(false);
  });
});

describe("invalid content is rejected", () => {
  it("answer must be an option", () => {
    expect(QuizQuestion.safeParse({ kind: "mc", prompt: "?", options: ["a", "b"], answer: "c" }).success).toBe(false);
  });
  it("fill sentence needs a blank", () => {
    expect(QuizQuestion.safeParse({ kind: "fill", sentence: "I have a cat.", options: ["a", "b"], answer: "a" }).success).toBe(false);
  });
  it("picture answer must match a label", () => {
    expect(QuizQuestion.safeParse({ kind: "picture", prompt: "Find", options: [{ emoji: "🐱", label: "cat" }, { emoji: "🐶", label: "dog" }], answer: "cow" }).success).toBe(false);
  });
  it("sort game needs categories", () => {
    expect(GameData.safeParse({ game: "sort", words: [{ word: "a", emoji: "🍎" }, { word: "b", emoji: "🍌" }, { word: "c", emoji: "🐱" }] }).success).toBe(false);
  });
  it("unknown worksheet kind fails", () => {
    expect(WorksheetSection.safeParse({ kind: "crossword", words: ["a"] }).success).toBe(false);
  });
  it("inspiration pack requires a topic", () => {
    expect(InspirationPack.safeParse({ kind: "inspiration-pack", items: [] }).success).toBe(false);
  });
});

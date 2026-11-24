import { describe, expect, it } from "vitest";
import { speakablesFor, commonSpeakables } from "@/lib/speakables";
import { speechSpeed, normalizeSpeech, isNaturalVoice, NATURAL_VOICES } from "@/lib/voices";
import { buildQuickPack } from "@/lib/quickPack";
import { PROFILES } from "@/lib/assessment";
import { gameItem } from "@/lib/games";
import type { GameKind } from "@/lib/schemas/content";

describe("voices", () => {
  it("speeds stay in a child-friendly range and slow is slower", () => {
    expect(speechSpeed(0.85, false)).toBe(0.85);
    expect(speechSpeed(0.85, true)).toBeLessThan(0.85);
    expect(speechSpeed(5, false)).toBe(1.2);
    expect(speechSpeed(0.1, true)).toBeGreaterThanOrEqual(0.55);
  });
  it("normalizes text and validates voice ids", () => {
    expect(normalizeSpeech("  Hello   there!  ")).toBe("Hello there!");
    // Line breaks stay (they are where the voice pauses); at most one blank line.
    expect(normalizeSpeech("  Hello \r\n  there!  \n\n\n\nBye.")).toBe("Hello\nthere!\n\nBye.");
    expect(isNaturalVoice("af_heart")).toBe(true);
    expect(isNaturalVoice("robot")).toBe(false);
    expect(NATURAL_VOICES.every((v) => /^a[fm]_/.test(v.id))).toBe(true); // American English only
  });
});

describe("speakables", () => {
  const unit = {
    title: "Toys",
    topic: "toys",
    vocabulary: ["ball", "car", "doll", "kite"].map((word, k) => ({ word, emoji: ["⚽", "🚗", "🪆", "🪁"][k] })),
    patterns: [{ text: "I have a ___.", function: "" }],
  };
  const items = buildQuickPack(unit, PROFILES["early-reader"], { seed: "s" });

  it("collects what the players say, without duplicates", () => {
    const vocab = speakablesFor(items.find((i) => i.type === "vocabulary")!);
    expect(vocab).toContainEqual({ text: "ball", slow: false });
    expect(vocab).toContainEqual({ text: "ball", slow: true });
    expect(vocab).toContainEqual({ text: "I have a ball.", slow: false });
    const keys = vocab.map((s) => `${s.slow}|${s.text}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("covers every game's lines, spelling and fill-in answers", () => {
    const words = unit.vocabulary;
    const game = (kind: GameKind) => speakablesFor(gameItem(kind, words, { seed: "s" })!).map((s) => s.text);
    expect(game("balloon")).toContain("Pop the kite!");
    expect(game("fishing")).toContain("Catch the doll!");
    expect(game("feed")).toEqual(expect.arrayContaining(["Give me the ball, please!", "Yummy! Thank you!"]));
    expect(game("spy")).toContain("Where is the car?");
    expect(game("traffic")).toEqual(expect.arrayContaining(["Is this the car?", "Hooray! You won the race!"]));
    expect(game("popup")).toContain("Tap the kite!");
    expect(game("echo")).toEqual(expect.arrayContaining(["ball", "Listen, then tap in the same order!", "Your turn!"]));
    expect(game("rocket")).toContain("Three, two, one. Blast off!");
    const spelling = speakablesFor(gameItem("spelling", words, { seed: "s" })!);
    expect(spelling.some((s) => s.slow && /^[a-z](, [a-z])+$/.test(s.text))).toBe(true);
    // The quick pack's two games are covered too.
    for (const it of items.filter((i) => i.type === "game")) expect(speakablesFor(it).map((s) => s.text)).toEqual(expect.arrayContaining(words.map((x) => x.word)));
    const quiz = speakablesFor({ type: "quiz", data: { questions: [{ kind: "fill", sentence: "I have a ___.", options: ["car", "kite"], answer: "car" }] } });
    expect(quiz.map((s) => s.text)).toEqual(["I have a car.", "I have a kite."]);
  });

  it("includes the praise lines and the try-again line", () => {
    expect(commonSpeakables().map((s) => s.text)).toContain("Amazing! Great job!");
    expect(commonSpeakables().map((s) => s.text)).toContain("Oops! Try again.");
  });

  it("keeps the lines of a reading passage", () => {
    const passage = "Where's Kate?\nShe's in the yard.\n\nWhere's Ken?\nHe's in the yard.";
    const r = speakablesFor({ type: "reading", data: { passage, questions: [] } });
    expect(r[0]).toEqual({ text: passage, slow: false });
  });
});

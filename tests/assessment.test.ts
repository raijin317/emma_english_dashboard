import { describe, expect, it } from "vitest";
import { assessBook, childFit } from "@/lib/assessment";
import type { UnitExtractCore } from "@/lib/schemas/book";

const u = (p: Partial<UnitExtractCore>): UnitExtractCore => ({
  title: "U",
  topic: "t",
  vocabulary: [],
  patterns: [],
  sentences: [],
  readings: [],
  phonics: [],
  songsChants: [],
  skills: [],
  activityTypes: [],
  longestReadingWords: 0,
  confidence: 1,
  ...p,
});

const words = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => ({ word: `${prefix}${i}` }));

describe("assessBook", () => {
  it("preschool label → pre-reader, ages 3–5", () => {
    const a = assessBook(0, [u({ vocabulary: words(5, "a"), skills: ["listening", "speaking"] })]);
    expect(a.stage).toBe("pre-reader");
    expect(a.estimatedAge).toEqual({ min: 3, max: 5 });
    expect(a.cefr).toBe("Pre-A1");
    expect(a.generationProfile.allowWriting).toBe(false);
  });

  it("grade 3 → developing reader, ages 8–9", () => {
    const a = assessBook(3, [u({ vocabulary: words(8, "b"), skills: ["reading", "writing"], longestReadingWords: 60, patterns: [{ text: "What do you do at break time?", function: "" }] })]);
    expect(a.stage).toBe("developing-reader");
    expect(a.estimatedAge).toEqual({ min: 8, max: 9 });
    expect(a.cefr).toBe("A1");
  });

  it("no grade → estimated from content", () => {
    const pre = assessBook(null, [u({ vocabulary: words(4, "c"), patterns: [{ text: "Hello!", function: "" }], skills: ["listening", "speaking"] })]);
    expect(pre.stage).toBe("pre-reader");
    const upper = assessBook(null, [u({ vocabulary: words(12, "d"), skills: ["reading", "writing"], longestReadingWords: 130, patterns: [{ text: "What did you do last weekend with your family?", function: "" }] })]);
    expect(upper.stage).toBe("independent-reader");
    expect(upper.cefr).toBe("A2");
  });

  it("explains a mismatch between grade and content", () => {
    const a = assessBook(1, [u({ vocabulary: words(12, "e"), skills: ["reading", "writing"], longestReadingWords: 120 })]);
    expect(a.rationale.join(" ")).toMatch(/harder/);
  });

  it("counts distinct words across units", () => {
    const a = assessBook(2, [u({ vocabulary: [{ word: "Cat" }, { word: "dog" }] }), u({ vocabulary: [{ word: "cat" }, { word: "fish" }] })]);
    expect(a.metrics.distinctWords).toBe(3);
    expect(a.metrics.avgNewWordsPerUnit).toBe(2);
  });
});

describe("childFit", () => {
  const a = { estimatedAge: { min: 6, max: 7 } };
  it("younger child → challenging", () => expect(childFit(4, a).level).toBe("challenging"));
  it("in range → suitable", () => expect(childFit(7, a).level).toBe("suitable"));
  it("much older → easy", () => expect(childFit(10, a).level).toBe("easy"));
});

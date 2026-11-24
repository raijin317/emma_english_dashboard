import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, RULE, mergeRules, ruleOn, rulesText } from "@/lib/rules";
import { bookSentenceFor, bookTexts, isFromBook, wordsOutsideBook } from "@/lib/bookText";
import { buildPictureMap, lookupPicture, picKey } from "@/lib/pictures";
import { buildQuickPack } from "@/lib/quickPack";
import { PROFILES } from "@/lib/assessment";
import { UnitExtractCore } from "@/lib/schemas/book";
import { validateItemData, type PackItem } from "@/lib/schemas/content";

const unit = UnitExtractCore.parse({
  title: "Hello",
  topic: "greetings",
  vocabulary: [
    { word: "ball", emoji: "⚽", pic: { page: 7, box: [0.1, 0.2, 0.2, 0.2] } },
    { word: "book", emoji: "📘", pic: { page: 7, box: [0.4, 0.2, 0.2, 0.2] } },
    { word: "bike", emoji: "🚲" },
    { word: "Bill", emoji: "👦", pic: { page: 8, box: [0.5, 0.5, 2, 0.3] } },
  ],
  patterns: [{ text: "B, b, a ___.", function: "phonics chant" }],
  sentences: ["Hello, I'm Bill.", "It's a ball.", "I have a book."],
  readings: [{ title: "Let's talk", text: "Bill: Hello, I'm Bill.\nMai: Hi, Bill. I'm Mai.", page: 8 }],
});

describe("lesson rules", () => {
  it("keeps the 4 built-in rules (editable, never lost) and adds the parent's own", () => {
    const merged = mergeRules([{ id: RULE.bookPictures, text: "Use book pictures.", on: false }, { id: "custom-1", text: "Use my son's name, Bin.", on: true }]);
    expect(merged.map((r) => r.id)).toEqual([RULE.bookOnly, RULE.bookPictures, RULE.bookReading, RULE.kidClear, "custom-1"]);
    expect(merged[1]).toMatchObject({ text: "Use book pictures.", on: false });
    expect(ruleOn(merged, RULE.bookPictures)).toBe(false);
    expect(ruleOn(merged, RULE.bookOnly)).toBe(true);
    expect(rulesText(merged)).toContain("4. Use my son's name, Bin.");
    expect(rulesText(merged)).not.toContain("Use book pictures.");
    expect(mergeRules("garbage")).toEqual(DEFAULT_RULES);
  });
});

describe("book texts", () => {
  it("clamps a picture box that runs off the page", () => {
    const box = unit.vocabulary[3].pic!.box;
    expect(box[0] + box[2]).toBeCloseTo(1, 6);
  });

  it("finds the book's sentence for a word and checks passages against the book", () => {
    expect(bookSentenceFor("ball", unit.sentences)).toBe("It's a ball.");
    expect(bookSentenceFor("Bill", unit.sentences)).toBe("Hello, I'm Bill.");
    expect(bookSentenceFor("bike", unit.sentences)).toBeUndefined();
    const texts = bookTexts(unit);
    expect(isFromBook("Hi, Bill. I'm Mai.", texts)).toBe(true); // a part of the text is fine
    expect(isFromBook("Bill has a red bike.", texts)).toBe(false);
    // Without reading texts, the book's sentences make one.
    expect(bookTexts({ readings: [], sentences: ["It's a ball.", "I have a book."] })[0].text).toBe("It's a ball.\nI have a book.");
  });

  it("spots words that are not in the book", () => {
    const item: PackItem = { type: "game", title: "Pop", data: { game: "balloon", words: [{ word: "balls", emoji: "⚽" }, { word: "book", emoji: "📘" }, { word: "dinosaur", emoji: "🦖" }] } };
    expect(wordsOutsideBook(item, ["ball", "book", "bike"])).toEqual(["dinosaur"]);
  });
});

describe("book pictures", () => {
  it("maps words (and unique emoji) to crops of the page", () => {
    const map = buildPictureMap("tieng-anh-1", [unit]);
    expect(lookupPicture(map, "Ball")).toBe("/api/books/tieng-anh-1/crop?p=7&b=0.1000,0.2000,0.2000,0.2000&s=400");
    expect(lookupPicture(map, "a book")).toContain("p=7&b=0.4000");
    expect(lookupPicture(map, "balls")).toBe(lookupPicture(map, "ball"));
    expect(lookupPicture(map, undefined, "⚽")).toBe(lookupPicture(map, "ball"));
    expect(lookupPicture(map, "bike", "🚲")).toBeNull(); // no picture in the book → emoji
    expect(picKey("  The Teddy  Bear! ")).toBe("teddy bear");
  });
});

describe("offline lessons follow the book", () => {
  it("reading = the book's own text; examples and speaking use the book's sentences", () => {
    const items = buildQuickPack(unit, PROFILES["pre-reader"], { seed: "x" });
    const reading = items.find((i) => i.type === "reading");
    expect(reading?.data).toMatchObject({ passage: unit.readings[0].text });
    expect(reading?.title).toBe("Hello: Let's talk");
    const vocab = items.find((i) => i.type === "vocabulary")!.data as { words: { word: string; example?: string }[] };
    expect(vocab.words.find((w) => w.word === "ball")?.example).toBe("It's a ball.");
    const speaking = items.find((i) => i.type === "speaking")!.data as { prompts: { text: string }[] };
    expect(speaking.prompts.map((p) => p.text)).toContain("Hello, I'm Bill.");
    for (const it of items) expect(validateItemData(it.type, it.data).success).toBe(true);
  });

  it("never fills a two-gap pattern with one word", () => {
    const two = { ...unit, sentences: [], readings: [], patterns: [{ text: "Hi, ___. I'm ___.", function: "" }] };
    const items = buildQuickPack(two, PROFILES["early-reader"], { seed: "y" });
    expect(JSON.stringify(items)).not.toMatch(/Hi, (ball|book|bike|Bill)\. I'm ___/);
  });

  it("no reading when the rule is off or the unit has no text", () => {
    const off = DEFAULT_RULES.map((r) => (r.id === RULE.bookReading ? { ...r, on: false } : r));
    expect(buildQuickPack(unit, PROFILES["pre-reader"], { seed: "x", rules: off }).some((i) => i.type === "reading")).toBe(false);
    expect(buildQuickPack({ ...unit, readings: [], sentences: [] }, PROFILES["pre-reader"], { seed: "x" }).some((i) => i.type === "reading")).toBe(false);
  });
});

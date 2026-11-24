import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { PAUSE, originalIndex, speechPlan, wordTimeline } from "@/lib/speechPlan";
import { stitchSpeech, trimSilence } from "@/server/tts/stitch";
import { ttsFile } from "@/server/tts/cache";

const said = (text: string) => speechPlan(text).map((p) => p.say);
const pauses = (text: string) => speechPlan(text).map((p) => p.pause);

describe("speech plan — where the voice pauses", () => {
  it("a word or one plain sentence is read in one go, unchanged", () => {
    expect(speechPlan("ball")).toEqual([{ say: "ball", start: 0, end: 4, pause: 0 }]);
    expect(said("Pop the cat!")).toEqual(["Pop the cat!"]);
    expect(said("a, p, p, l, e")).toEqual(["a, p, p, l, e"]);
    expect(said("I like apples, bananas and milk.")).toEqual(["I like apples, bananas and milk."]);
  });

  it("reads a book passage line by line, with a longer pause between paragraphs", () => {
    const text = "Where's Kate?\nShe's in the yard.\nIs she riding a bike?\nYes, she is. Yes, she is.\n\nWhere's Ken?\nHe's in the yard.";
    expect(said(text)).toEqual(["Where's Kate?", "She's in the yard.", "Is she riding a bike?", "Yes, she is.", "Yes, she is.", "Where's Ken?", "He's in the yard."]);
    expect(pauses(text)).toEqual([PAUSE.line, PAUSE.line, PAUSE.line, PAUSE.sentence, PAUSE.paragraph, PAUSE.line, 0]);
  });

  it("lines without a full stop still end like a sentence (no run-on)", () => {
    expect(said("This is my bag\nThat is my pen")).toEqual(["This is my bag.", "That is my pen."]);
  });

  it("a line that goes on in small letters is one sentence (no pause in the middle)", () => {
    expect(said("My name is Linh. I am eight\nyears old.")).toEqual(["My name is Linh.", "I am eight years old."]);
    expect(said("Hello, hello,\nhow are you?\nI'm fine.")).toEqual(["Hello, hello, how are you?", "I'm fine."]);
  });

  it("dialogues: speaker labels are not read, blanks become a short pause", () => {
    const text = "A: Is he flying a ____?\nB: Yes, he is.\nA: Is she riding a ____?\nB: Yes, she is.";
    expect(said(text)).toEqual(["Is he flying a …?", "Yes, he is.", "Is she riding a …?", "Yes, she is."]);
    expect(said("Mai: Hello! I'm Mai.\nNam: Hi, Mai.")).toEqual(["Hello!", "I'm Mai.", "Hi, Mai."]);
    // One "Look: …" line is not a dialogue — keep the word.
    expect(said("Look: a cat!")).toEqual(["Look: a cat!"]);
  });

  it("does not split after Mr. / numbers / ellipses, and drops emoji", () => {
    expect(said("Mr. Brown is here. He is 3.5 metres tall.")).toEqual(["Mr. Brown is here.", "He is 3.5 metres tall."]);
    expect(said("Wait... it's a dog. No. It's a cat.")).toEqual(["Wait... it's a dog.", "No.", "It's a cat."]);
    expect(said("I like pizza 🍕! Yummy 😋")).toEqual(["I like pizza!", "Yummy."]);
    expect(speechPlan("🎉 ⭐")).toEqual([]);
  });

  it("cuts a very long sentence at a comma near the middle", () => {
    const long = "On Sunday morning my little brother and I went to the big green park near our house, and we played football with our friends from school until it was time to go home for lunch with Mom and Dad.";
    const parts = speechPlan(long);
    expect(parts.length).toBe(2);
    expect(parts[0].say.endsWith(",")).toBe(true);
    expect(parts[0].pause).toBe(PAUSE.comma);
  });

  it("parts point back into the original text (for highlighting)", () => {
    const text = "Mai:  Hello!\r\nNam: Hi.";
    for (const p of speechPlan(text)) expect(p.say.startsWith(text.slice(p.start, p.end).split(/\s/)[0])).toBe(true);
    const [, hi] = speechPlan(text);
    expect(originalIndex(text, hi, 0)).toBe(text.indexOf("Hi."));
  });
});

describe("word timeline (highlight follows the pauses)", () => {
  it("a word after a paragraph pause starts later than an even split would say", () => {
    const text = "Hi.\n\nBye.";
    const t = wordTimeline(text, 1, 2);
    expect(t.map((w) => w.start)).toEqual([0, text.indexOf("Bye.")]);
    const talk = 2 - PAUSE.paragraph / 1000;
    // "Hi." weighs 5 of 11 (length + 2), then the paragraph pause.
    expect(t[1].at).toBeCloseTo((5 / 11) * talk + PAUSE.paragraph / 1000, 5);
  });
  it("one sentence: words share the time by length", () => {
    const t = wordTimeline("I like it", 1, 1.5);
    expect(t[0].at).toBe(0);
    expect(t[1].at).toBeCloseTo((3 / 13) * 1.5, 5);
  });
});

describe("audio stitching", () => {
  it("trims quiet edges (keeping a little air) and puts the pause between clips", () => {
    const rate = 1000;
    const clip = new Float32Array(1000);
    clip.fill(0.5, 400, 600);
    const t = trimSilence(clip, rate);
    expect(t.length).toBe(200 + 30 + 80);
    const out = stitchSpeech([clip, clip], [400, 0], 0.8, rate);
    expect(out.length).toBe(2 * t.length + Math.round((400 / 1000 / 0.8) * rate));
  });
});

describe("voice cache keys", () => {
  it("words and single sentences keep their key; texts read in parts get a new one", () => {
    // The key of a plain sentence must not change (the family's prepared voice stays valid).
    const plain = ttsFile("I have a ball.", "af_heart", 0.85);
    expect(plain).toMatch(/[\\/]af_heart[\\/][0-9a-f]{20}\.wav$/);
    expect(plain).toContain(createHash("sha1").update("0.85|I have a ball.").digest("hex").slice(0, 20));
    const passage = ttsFile("Hi.\nBye.", "af_heart", 0.85);
    expect(passage).not.toContain(createHash("sha1").update("0.85|Hi.\nBye.").digest("hex").slice(0, 20));
  });
});

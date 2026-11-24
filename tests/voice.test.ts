import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A fake TTS worker that writes tiny files and logs the order it made them in.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-voice-"));
process.env.TTS_CACHE_DIR = path.join(tmp, "tts");
process.env.TTS_WORKER = "tests/fixtures/fake-tts-worker.mjs";
process.env.FAKE_TTS_LOG = path.join(tmp, "made.log");
process.env.FAKE_TTS_MS = "150";

const made = () => fs.readFileSync(process.env.FAKE_TTS_LOG!, "utf8").trim().split("\n");
afterAll(() => {
  (globalThis as unknown as { __sunnyTts?: { proc: { kill: () => void } } | null }).__sunnyTts?.proc.kill();
});

describe("voice queue", () => {
  it("a tap is made before prefetches and the background warm-up", async () => {
    const { speechFile } = await import("@/server/tts/client");
    const v = "af_heart";
    const jobs = [
      speechFile("first", v, 0.85, "idle"), // starts at once
      speechFile("prefetch one", v, 0.85, "soon"),
      speechFile("warm one", v, 0.85, "idle"),
      speechFile("prefetch two", v, 0.85, "soon"),
      speechFile("tapped word", v, 0.85, "now"),
    ];
    await Promise.all(jobs);
    expect(made()).toEqual(["first", "tapped word", "prefetch one", "prefetch two", "warm one"]);
  });

  it("asking again for a clip that is waiting moves it up (and makes it once)", async () => {
    fs.writeFileSync(process.env.FAKE_TTS_LOG!, "");
    const { speechFile } = await import("@/server/tts/client");
    const v = "af_heart";
    const a = speechFile("busy", v, 0.85, "idle");
    const b = speechFile("later", v, 0.85, "idle");
    const c = speechFile("wanted", v, 0.85, "idle");
    const c2 = speechFile("wanted", v, 0.85, "now"); // the child taps it
    const [, , f1, f2] = await Promise.all([a, b, c, c2]);
    expect(f1).toBe(f2);
    expect(made()).toEqual(["busy", "wanted", "later"]);
  });
});

describe("speech units (what the players ask the server for)", () => {
  it("passages become their sentences; texts are cleaned exactly like the player does", async () => {
    const { speechUnits } = await import("@/lib/speakables");
    const units = speechUnits([
      { text: "A: Is he flying a ____?\nB: Yes, he is.", slow: false },
      { text: "Yes, he is.", slow: false },
      { text: "I like pizza 🍕!", slow: true },
      { text: "🎉", slow: false },
    ]);
    expect(units).toEqual([
      { text: "Is he flying a …?", slow: false },
      { text: "Yes, he is.", slow: false },
      { text: "I like pizza!", slow: true },
    ]);
  });
});

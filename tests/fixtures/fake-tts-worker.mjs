// Fake TTS worker for tests (same line protocol as scripts/tts-worker.ts): writes a short silent WAV per request,
// slowly enough that a queue builds up, and logs the order it made them in (FAKE_TTS_LOG).
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createHash } from "node:crypto";

const send = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const dir = process.env.TTS_CACHE_DIR || ".tmp/fake-tts";

/** 0.3 s of silence, 16-bit mono 24 kHz — a real, playable WAV. */
function silentWav(seconds = 0.3, rate = 24000) {
  const n = Math.round(seconds * rate);
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * 2, 40);
  return b;
}

let chain = Promise.resolve();
send({ ready: true });
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const req = JSON.parse(line);
  chain = chain.then(async () => {
    await new Promise((r) => setTimeout(r, Number(process.env.FAKE_TTS_MS || 80)));
    const file = path.resolve(dir, req.voice, `fake-${createHash("sha1").update(`${req.speed}|${req.text}`).digest("hex").slice(0, 12)}.wav`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, silentWav());
    if (process.env.FAKE_TTS_LOG) fs.appendFileSync(process.env.FAKE_TTS_LOG, req.text + "\n");
    send({ id: req.id, file });
  });
});

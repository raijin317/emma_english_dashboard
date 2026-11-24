/**
 * Long-lived TTS worker used by the web server.
 * stdin:  {"id":1,"text":"Hello!","voice":"af_heart","speed":0.85}\n
 * stdout: {"ready":true} once, then {"id":1,"file":"…"} or {"id":1,"error":"…"} per request.
 */
import readline from "node:readline";
import { loadTts, synthesize } from "../src/server/tts/engine";

const send = (o: unknown) => process.stdout.write(JSON.stringify(o) + "\n");
let chain: Promise<unknown> = Promise.resolve();

loadTts()
  .then(() => send({ ready: true }))
  .catch((e) => {
    send({ fatal: (e as Error).message });
    process.exit(1);
  });

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  let req: { id: number; text: string; voice: string; speed: number };
  try {
    req = JSON.parse(line);
  } catch {
    return;
  }
  chain = chain.then(async () => {
    try {
      send({ id: req.id, file: await synthesize(req.text, req.voice, req.speed) });
    } catch (e) {
      send({ id: req.id, error: (e as Error).message });
    }
  });
});
process.stdin.on("end", () => chain.then(() => process.exit(0)));

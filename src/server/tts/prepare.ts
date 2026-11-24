import { appSpeakables, speakablesFor, speechUnits, type Speakable } from "@/lib/speakables";
import { speechSpeed } from "@/lib/voices";
import type { ContentItem } from "@/lib/schemas/content";
import { synthesize } from "./engine";
import { ttsFile } from "./cache";
import fs from "node:fs";

/** Pre-generates natural-voice audio for every sentence of these items (skips what is cached). */
export async function prepareAudio(items: Pick<ContentItem, "type" | "data">[], voice: string, childRate: number, log: (done: number, total: number) => void = () => {}) {
  const seen = new Set<string>();
  const all: Speakable[] = [];
  // Texts read in parts are prepared part by part — that is how the players ask for them.
  for (const s of speechUnits([...appSpeakables(), ...items.flatMap((i) => speakablesFor(i))])) {
    const k = `${s.slow}|${s.text}`;
    if (!seen.has(k)) {
      seen.add(k);
      all.push(s);
    }
  }
  const todo = all.filter((s) => !fs.existsSync(ttsFile(s.text, voice, speechSpeed(childRate, s.slow))));
  let done = all.length - todo.length;
  log(done, all.length);
  for (const s of todo) {
    try {
      await synthesize(s.text, voice, speechSpeed(childRate, s.slow));
    } catch {
      /* skip one bad sentence */
    }
    done++;
    if (done % 10 === 0 || done === all.length) log(done, all.length);
  }
  return { total: all.length, generated: todo.length };
}

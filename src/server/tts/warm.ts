import fs from "node:fs";
import { appSpeakables, speakablesFor, speechUnits } from "@/lib/speakables";
import { speechSpeed } from "@/lib/voices";
import { getAppSettings, listBooks, listItems, listUnits } from "../repo";
import { isRunning } from "../scripts";
import { ttsFile } from "./cache";
import { speechFile } from "./client";

/**
 * Background warm-up: makes the natural voice for every approved lesson that is not cached yet,
 * one clip at a time at "idle" priority — a tap or a prefetch always goes first.
 * Runs after the server starts and again whenever lessons, topics or the voice/speed change,
 * so the family never has to press "Prepare voices" (and a new speed setting doesn't mean slow taps).
 */
type WarmState = { gen: number; running: boolean; done: number; total: number };
const g = globalThis as unknown as { __sunnyWarm?: WarmState; __sunnyWarmTimer?: NodeJS.Timeout };
const state = (g.__sunnyWarm ??= { gen: 0, running: false, done: 0, total: 0 });

export function warmState() {
  return { running: state.running, done: state.done, total: state.total };
}

/** (Re)starts the warm-up soon (several calls in a row start it once). */
export function warmVoices(delayMs = 2000) {
  if (process.env.SUNNY_NO_TTS_WARMUP === "1") return;
  clearTimeout(g.__sunnyWarmTimer);
  g.__sunnyWarmTimer = setTimeout(() => void run(++state.gen), delayMs);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Lessons in the order a child meets them: unit 1 of every book first, then unit 2, …, then the extra topics. */
function lessonsInOrder() {
  const order = new Map<string, number>();
  for (const b of listBooks()) for (const u of listUnits(b.id)) order.set(u.id, u.order);
  return listItems({ status: "approved" }).sort((a, b) => (a.unitId ? (order.get(a.unitId) ?? 99) : 999) - (b.unitId ? (order.get(b.unitId) ?? 99) : 999));
}

async function run(gen: number) {
  try {
    const s = getAppSettings();
    if (s.ttsEngine !== "natural") return;
    const units = speechUnits([...appSpeakables(), ...lessonsInOrder().flatMap((i) => speakablesFor(i))]);
    const speedOf = (slow: boolean) => speechSpeed(s.childRate, slow);
    const todo = units.filter((u) => !fs.existsSync(ttsFile(u.text, s.ttsVoice, speedOf(u.slow))));
    Object.assign(state, { running: todo.length > 0, done: 0, total: todo.length });
    for (const u of todo) {
      // The book pipeline or "Prepare voices" makes voices in their own process — don't double the work.
      while (isRunning("tts") || isRunning("books")) {
        await sleep(15_000);
        if (gen !== state.gen) return;
      }
      if (gen !== state.gen) return; // settings or lessons changed: a newer run took over
      try {
        await speechFile(u.text, s.ttsVoice, speedOf(u.slow), "idle");
      } catch {
        /* one bad sentence: skip */
      }
      state.done++;
    }
  } catch (e) {
    console.error("[voice warm-up]", (e as Error).message);
  } finally {
    if (gen === state.gen) state.running = false;
  }
}

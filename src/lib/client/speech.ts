"use client";

import { DEFAULT_VOICE, normalizeSpeech, speechSpeed } from "../voices";
import { speechUnits, type Speakable } from "../speakables";
import { originalIndex, speechPlan, wordTimeline, type SpeechPart } from "../speechPlan";
import { ONLINE } from "../mode";
import { onlineVoiceUrl } from "../assetKeys";

/**
 * American English speech.
 * - "natural": Kokoro neural voice rendered by our server (/api/tts) — human-like, expressive.
 *   Online: the same clips, made at home and published as MP3 files (a sentence without a clip uses the browser voice).
 * - "browser": Web Speech API (fallback when the natural voice is unavailable).
 */

type Settings = { engine: "natural" | "browser"; voice: string; voiceName: string; childRate: number };
let settings: Settings = { engine: "natural", voice: DEFAULT_VOICE, voiceName: "", childRate: 0.85 };
let naturalFailures = 0;

export function configureSpeech(s: Partial<Settings>) {
  settings = { ...settings, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) };
  naturalFailures = 0;
}

export function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export type SpeakOpts = {
  slow?: boolean;
  onBoundary?: (charIndex: number) => void;
  /** The text was read to the end (use it to chain the next thing to say). */
  onEnd?: () => void;
  /** The voice actually started (a "⏳ getting ready" look can stop here). */
  onStart?: () => void;
  /** Finished OR stopped by something else — for buttons that show "speaking". */
  onDone?: () => void;
  voice?: string;
};

/** How long a tap waits for the natural voice before the browser voice takes over (the clip is still made and cached). */
const NATURAL_WAIT_MS = 6000;

let token = 0;
let current: HTMLAudioElement | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
let doneCb: (() => void) | null = null;

export function naturalUrl(text: string, slow = false, voice = settings.voice) {
  const speed = speechSpeed(settings.childRate, slow);
  if (ONLINE) return onlineVoiceUrl(voice, text, speed);
  return `/api/tts?v=${encodeURIComponent(voice)}&s=${speed}&text=${encodeURIComponent(normalizeSpeech(text))}`;
}

/**
 * Says a text. Texts read in parts (sentences / lines, see speechPlan) are played part by part:
 * the first sentence starts as soon as it is ready, the next one is fetched while the first plays,
 * and the planned pause is left between them.
 */
export async function speak(text: string, opts: SpeakOpts = {}) {
  stopSpeaking();
  const my = ++token;
  doneCb = opts.onDone ?? null;
  const plan = speechPlan(text);
  if (!plan.length) return finish(my, opts);
  if ((settings.engine === "natural" || opts.voice) && naturalFailures < 3) {
    const r = await playNaturalFrom(text, plan, 0, opts, my);
    if (r === "ok" || my !== token) return;
  }
  if (my === token) browserSpeak(text, plan, 0, opts, my);
}

function finish(my: number, opts: SpeakOpts) {
  if (my !== token) return;
  doneCb = null;
  opts.onEnd?.();
  opts.onDone?.();
}

export function stopSpeaking() {
  token++;
  if (ticker) clearInterval(ticker);
  ticker = null;
  if (current) {
    current.onended = current.onerror = current.onplaying = null;
    current.pause();
    current = null;
  }
  if (speechSupported()) window.speechSynthesis.cancel();
  const cb = doneCb;
  doneCb = null;
  cb?.();
}

/** Starts one part; resolves with the playing element, or null if the natural voice can't play it (soon enough). */
function playPart(part: SpeechPart, opts: SpeakOpts, my: number): Promise<HTMLAudioElement | null> {
  return new Promise((resolve) => {
    const a = new Audio(naturalUrl(part.say, !!opts.slow, opts.voice));
    current = a;
    let settled = false;
    const settle = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok ? a : null);
    };
    // Too slow (the clip is still being made): let the browser voice answer now; the clip is cached for next time.
    const timer = setTimeout(() => {
      if (my === token) a.pause();
      settle(false);
    }, NATURAL_WAIT_MS);
    a.onplaying = () => {
      naturalFailures = 0;
      settle(true);
    };
    a.onerror = () => {
      // Online a missing clip is one sentence not made at home (that sentence uses the browser voice), not a broken voice server.
      if (!settled && !ONLINE) naturalFailures++;
      settle(false);
    };
    a.play().catch(() => settle(false));
  });
}

async function playNaturalFrom(text: string, plan: SpeechPart[], k: number, opts: SpeakOpts, my: number): Promise<"ok" | "fallback"> {
  const part = plan[k];
  const a = await playPart(part, opts, my);
  if (my !== token) {
    a?.pause();
    return "ok";
  }
  if (!a) return "fallback";
  if (k === 0) opts.onStart?.();
  const speed = speechSpeed(settings.childRate, !!opts.slow);
  if (opts.onBoundary) followPart(a, text, part, speed, opts.onBoundary);
  // Fetch the next sentence while this one plays.
  const next = plan[k + 1];
  if (next) void fetch(naturalUrl(next.say, !!opts.slow, opts.voice)).catch(() => {});
  a.onended = () => {
    if (ticker) clearInterval(ticker);
    ticker = null;
    if (my !== token) return;
    if (!next) return finish(my, opts);
    setTimeout(async () => {
      if (my !== token) return;
      const r = await playNaturalFrom(text, plan, k + 1, opts, my);
      if (r === "fallback" && my === token) browserSpeak(text, plan, k + 1, opts, my);
    }, part.pause / speed);
  };
  return "ok";
}

/** Word highlighting inside one playing part (words share its time by length). */
function followPart(a: HTMLAudioElement, text: string, part: SpeechPart, speed: number, onBoundary: (charIndex: number) => void) {
  const piece = text.slice(part.start, part.end);
  let timeline: { start: number; at: number }[] | null = null;
  let last = -1;
  if (ticker) clearInterval(ticker);
  ticker = setInterval(() => {
    if (!a.duration || !isFinite(a.duration)) return;
    timeline ??= wordTimeline(piece, speed, a.duration);
    if (!timeline.length) return;
    const idx = Math.max(0, timeline.findLastIndex((w) => w.at <= a.currentTime));
    if (idx !== last) {
      last = idx;
      onBoundary(part.start + timeline[idx].start);
    }
  }, 60);
}

/* ------------------------------- browser voice ------------------------------- */

const PREFERRED = [/Ana.*Natural/i, /Ava.*Natural.*United States/i, /Jenny.*Natural/i, /Aria.*Natural/i, /Natural.*English \(United States\)/i, /Google US English/i, /Samantha/i];
let cachedVoices: SpeechSynthesisVoice[] = [];

export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return Promise.resolve([]);
  const list = () => window.speechSynthesis.getVoices().filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith("en-us"));
  const now = list();
  if (now.length) return Promise.resolve((cachedVoices = now));
  return new Promise((resolve) => {
    const done = () => resolve((cachedVoices = list()));
    window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });
}

export function pickVoice(voices = cachedVoices): SpeechSynthesisVoice | null {
  if (settings.voiceName) {
    const chosen = voices.find((v) => v.name === settings.voiceName);
    if (chosen) return chosen;
  }
  for (const re of PREFERRED) {
    const v = voices.find((x) => re.test(x.name));
    if (v) return v;
  }
  return voices[0] ?? null;
}

/** Browser voice: the same sentence/line parts as the natural voice, with the same pauses between them. */
async function browserSpeak(text: string, plan: SpeechPart[], from: number, opts: SpeakOpts, my: number) {
  if (!speechSupported()) return finish(my, opts);
  if (!cachedVoices.length) await loadVoices();
  if (my !== token) return;
  const rate = speechSpeed(settings.childRate, !!opts.slow);
  const say = (k: number) => {
    if (my !== token) return;
    const part = plan[k];
    const u = new SpeechSynthesisUtterance(part.say);
    u.lang = "en-US";
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = rate;
    u.pitch = 1.1;
    if (k === from) u.onstart = () => my === token && opts.onStart?.();
    if (opts.onBoundary) u.onboundary = (e) => opts.onBoundary!(originalIndex(text, part, e.charIndex));
    u.onend = () => {
      if (my !== token) return;
      if (k + 1 < plan.length) setTimeout(() => say(k + 1), part.pause / rate);
      else finish(my, opts);
    };
    u.onerror = () => finish(my, opts);
    window.speechSynthesis.speak(u);
  };
  say(from);
}

/* ------------------------------- prefetching ------------------------------- */

/**
 * Warms the server + browser cache for the activity on screen: clip by clip (passages as their sentences),
 * short things first. Sent as "soon", so the server makes them only after anything the child taps.
 */
export function prefetchSpeech(list: Speakable[], signal?: AbortSignal) {
  if (settings.engine !== "natural" || typeof window === "undefined") return;
  const units = speechUnits(list);
  const queue = [...units.filter((u) => u.text.length <= 60), ...units.filter((u) => u.text.length > 60)];
  const worker = async () => {
    while (queue.length && !signal?.aborted) {
      const s = queue.shift()!;
      try {
        await fetch(naturalUrl(s.text, s.slow), { signal, priority: "low", headers: { "x-tts-priority": "soon" } } as RequestInit);
      } catch {
        return;
      }
    }
  };
  void worker();
  void worker();
}

/* ------------------------- speech recognition (unchanged) ------------------------- */

type RecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string } } & { length: number } } & { length: number } }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export function recognitionSupported() {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/** Listens once and resolves with the alternatives heard (lower-cased). */
export function listenOnce(timeoutMs = 7000): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return reject(new Error("Speech recognition is not available in this browser."));
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 5;
    let heard: string[] = [];
    const timer = setTimeout(() => rec.stop(), timeoutMs);
    rec.onresult = (e) => {
      const r = e.results[0];
      heard = Array.from({ length: r.length }, (_, i) => r[i].transcript.toLowerCase().trim());
    };
    rec.onerror = (e) => {
      clearTimeout(timer);
      if (e.error === "no-speech") resolve([]);
      else reject(new Error(e.error === "not-allowed" ? "Please allow the microphone." : e.error));
    };
    rec.onend = () => {
      clearTimeout(timer);
      resolve(heard);
    };
    rec.start();
  });
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Lenient match for young children: share of expected words that were heard. Returns 0–3 stars. */
export function speechStars(expected: string, heard: string[]): number {
  const target = norm(expected).split(" ").filter(Boolean);
  if (!target.length || !heard.length) return 0;
  let best = 0;
  for (const h of heard) {
    const got = new Set(norm(h).split(" "));
    const hit = target.filter((w) => got.has(w) || [...got].some((g) => g.length > 2 && (g.startsWith(w.slice(0, 3)) || w.startsWith(g.slice(0, 3))))).length;
    best = Math.max(best, hit / target.length);
  }
  return best >= 0.85 ? 3 : best >= 0.5 ? 2 : best > 0 ? 1 : 0;
}

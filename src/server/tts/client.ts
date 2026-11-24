import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { paths } from "../paths";
import { ttsFile } from "./cache";

/**
 * Talks to scripts/tts-worker.ts (one long-lived process; Kokoro stays out of the Next.js server).
 * The worker makes one clip at a time, so the server keeps its own queue with priorities:
 *   now  — the child tapped 🔊 / a word (played right away)
 *   soon — prefetch of the activity on screen
 *   idle — background warm-up of all lessons (warm.ts)
 * A tap therefore waits at most for the one clip being made (≈1 s), never behind a long prefetch list.
 */
type Pending = { resolve: (f: string) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };
type Worker = { proc: ChildProcessWithoutNullStreams; pending: Map<number, Pending>; ready: Promise<void>; nextId: number };
export type SpeechPriority = "now" | "soon" | "idle";
const RANK: Record<SpeechPriority, number> = { now: 0, soon: 1, idle: 2 };
type Job = { file: string; text: string; voice: string; speed: number; rank: number; seq: number; waiters: { resolve: (f: string) => void; reject: (e: Error) => void }[] };
type Queue = { jobs: Job[]; busy: Job | null; seq: number };

const g = globalThis as unknown as { __sunnyTts?: Worker | null; __sunnyTtsQueue?: Queue };
const q = (g.__sunnyTtsQueue ??= { jobs: [], busy: null, seq: 0 });

function startWorker(): Worker {
  const tsxCli = path.join(/*turbopackIgnore: true*/ paths.root, "node_modules", "tsx", "dist", "cli.mjs");
  // TTS_WORKER: tests use a fake worker that writes tiny WAVs at once.
  const proc = spawn(process.execPath, [tsxCli, process.env.TTS_WORKER || "scripts/tts-worker.ts"], { cwd: paths.root, windowsHide: true, env: process.env });
  const pending = new Map<number, Pending>();
  let markReady!: () => void;
  let markFailed!: (e: Error) => void;
  const ready = new Promise<void>((res, rej) => ((markReady = res), (markFailed = rej)));
  let buf = "";
  proc.stdout.setEncoding("utf8");
  proc.stdout.on("data", (c: string) => {
    buf += c;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("{")) continue;
      try {
        const m = JSON.parse(line) as { ready?: boolean; fatal?: string; id?: number; file?: string; error?: string };
        if (m.ready) markReady();
        if (m.fatal) markFailed(new Error(m.fatal));
        if (m.id !== undefined) {
          const p = pending.get(m.id);
          if (!p) continue;
          pending.delete(m.id);
          clearTimeout(p.timer);
          if (m.file) p.resolve(m.file);
          else p.reject(new Error(m.error ?? "TTS failed"));
        }
      } catch {
        /* ignore noise */
      }
    }
  });
  proc.stderr.on("data", () => {});
  proc.on("exit", () => {
    for (const p of pending.values()) p.reject(new Error("TTS worker stopped"));
    pending.clear();
    markFailed(new Error("TTS worker stopped"));
    if (g.__sunnyTts?.proc === proc) g.__sunnyTts = null;
  });
  ready.catch(() => {});
  return { proc, pending, ready, nextId: 1 };
}

function worker() {
  if (!g.__sunnyTts) g.__sunnyTts = startWorker();
  return g.__sunnyTts;
}

/** Path of the WAV for this text (cached on disk; made by the worker when missing, in priority order). */
export function speechFile(text: string, voice: string, speed: number, priority: SpeechPriority = "now"): Promise<string> {
  const file = ttsFile(text, voice, speed);
  if (fs.existsSync(file)) return Promise.resolve(file);
  return new Promise<string>((resolve, reject) => {
    const rank = RANK[priority];
    const same = q.busy?.file === file ? q.busy : q.jobs.find((j) => j.file === file);
    if (same) {
      same.waiters.push({ resolve, reject });
      same.rank = Math.min(same.rank, rank); // a tap on something already queued for later moves it up
    } else q.jobs.push({ file, text, voice, speed, rank, seq: q.seq++, waiters: [{ resolve, reject }] });
    pump();
  });
}

function pump() {
  if (q.busy || !q.jobs.length) return;
  q.jobs.sort((a, b) => a.rank - b.rank || a.seq - b.seq);
  const job = q.jobs.shift()!;
  q.busy = job;
  make(job)
    .then(
      (f) => job.waiters.forEach((w) => w.resolve(f)),
      (e: Error) => job.waiters.forEach((w) => w.reject(e)),
    )
    .finally(() => {
      q.busy = null;
      pump();
    });
}

async function make(job: Job): Promise<string> {
  if (fs.existsSync(job.file)) return job.file;
  const w = worker();
  // First start loads the model; allow time.
  await Promise.race([w.ready, new Promise((_, rej) => setTimeout(() => rej(new Error("Voice engine is starting, try again")), 120_000))]);
  const id = w.nextId++;
  return new Promise<string>((resolve, reject) => {
    // A long text (several sentences) takes longer; give it time.
    const timer = setTimeout(() => {
      w.pending.delete(id);
      reject(new Error("TTS timeout"));
    }, 60_000 + job.text.length * 120);
    w.pending.set(id, { resolve, reject, timer });
    w.proc.stdin.write(JSON.stringify({ id, text: job.text, voice: job.voice, speed: job.speed }) + "\n");
  });
}

/** How many clips are waiting (for tests and the warm-up). */
export function speechQueue() {
  return { busy: !!q.busy, waiting: q.jobs.length, waitingNow: q.jobs.filter((j) => j.rank === 0).length };
}

/** Starts the voice engine in the background so the first sentence does not wait for the model. */
export function warmTts() {
  try {
    worker();
  } catch {
    /* ignore */
  }
}

export function ttsWorkerState() {
  return { running: !!g.__sunnyTts };
}

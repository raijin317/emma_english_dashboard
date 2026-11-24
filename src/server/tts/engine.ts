/**
 * Kokoro neural TTS (runs on the CPU, offline after the first model download).
 * Only imported by scripts (tts-worker, book pipeline) — never bundled into Next.js.
 */
import fs from "node:fs";
import path from "node:path";
import { KokoroTTS } from "kokoro-js";
import { env, RawAudio } from "@huggingface/transformers";
import { modelsDir, ttsFile } from "./cache";
import { stitchSpeech } from "./stitch";
import { normalizeSpeech } from "@/lib/voices";
import { speechPlan } from "@/lib/speechPlan";

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
/**
 * The full-precision model is ~3× faster than the 8-bit one on a laptop CPU (measured on the family PC:
 * 0.97 s vs 3.3 s for "She's in the yard."), so a tapped word is ready in under a second.
 * The 8-bit model (smaller download) is used until the full one is on disk, or with KOKORO_DTYPE=q8.
 */
const WANT: "fp32" | "q8" = process.env.KOKORO_DTYPE === "q8" ? "q8" : "fp32";
const FILES = { fp32: "model.onnx", q8: "model_quantized.onnx" } as const;
let loading: Promise<KokoroTTS> | null = null;

const onDisk = (dtype: keyof typeof FILES) => {
  const f = path.join(modelsDir(), ...MODEL.split("/"), "onnx", FILES[dtype]);
  return fs.existsSync(f) && fs.statSync(f).size > 10_000_000;
};
const load = (dtype: keyof typeof FILES) => KokoroTTS.from_pretrained(MODEL, { dtype, device: "cpu" });

export function loadTts() {
  if (!loading) {
    env.cacheDir = modelsDir();
    fs.mkdirSync(modelsDir(), { recursive: true });
    if (WANT === "q8" || onDisk("fp32") || !onDisk("q8")) {
      loading = load(WANT).catch((e) => (WANT === "fp32" ? load("q8") : Promise.reject(e)));
    } else {
      // Speak right away with the small model; fetch the fast one in the background and switch when it is ready.
      loading = load("q8");
      load("fp32").then(
        (fast) => (loading = Promise.resolve(fast)),
        () => {},
      );
    }
  }
  return loading;
}

/**
 * Makes (or reuses) the WAV for this text and returns its path.
 * Longer texts are read sentence by sentence / line by line (speechPlan) and joined with natural pauses —
 * a passage is never read as one breathless run, and nothing is cut off at the model's length limit.
 * (The players normally ask for one part at a time, so a passage starts playing after its first sentence.)
 */
export async function synthesize(text: string, voice: string, speed: number): Promise<string> {
  const file = ttsFile(text, voice, speed);
  if (fs.existsSync(file)) return file;
  const tts = await loadTts();
  const n = normalizeSpeech(text);
  const plan = speechPlan(n);
  let wav: ArrayBuffer;
  if (plan.length <= 1) {
    wav = (await tts.generate(plan[0]?.say ?? n, { voice: voice as never, speed })).toWav();
  } else {
    const clips: Float32Array[] = [];
    let rate = 24_000;
    for (const p of plan) {
      const a = await tts.generate(p.say, { voice: voice as never, speed });
      rate = a.sampling_rate;
      clips.push(a.audio);
    }
    wav = new RawAudio(stitchSpeech(clips, plan.map((p) => p.pause), speed, rate), rate).toWav();
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, Buffer.from(wav));
  fs.renameSync(tmp, file);
  return file;
}

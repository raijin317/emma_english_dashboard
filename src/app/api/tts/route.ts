import fs from "node:fs";
import { route, fail, localOnly } from "@/server/api";
import { speechFile } from "@/server/tts/client";
import { MAX_SPEECH_CHARS, isNaturalVoice, normalizeSpeech } from "@/lib/voices";

/**
 * GET /api/tts?text=…&v=af_heart&s=0.85 → natural-voice WAV (cached on disk and in the browser).
 * Prefetches send `x-tts-priority: soon` (same URL, so they fill the browser cache) and wait behind taps.
 */
export const GET = route(localOnly(async (req) => {
  const p = new URL(req.url).searchParams;
  const text = normalizeSpeech(p.get("text") ?? "");
  const voice = p.get("v") ?? "";
  const speed = Number(p.get("s"));
  if (!text || text.length > MAX_SPEECH_CHARS) return fail("Bad text");
  if (!isNaturalVoice(voice)) return fail("Unknown voice");
  if (!(speed >= 0.5 && speed <= 1.3)) return fail("Bad speed");
  const file = await speechFile(text, voice, speed, req.headers.get("x-tts-priority") === "soon" ? "soon" : "now");
  return new Response(new Uint8Array(fs.readFileSync(file)), {
    headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=31536000, immutable" },
  });
}));

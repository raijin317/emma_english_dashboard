import path from "node:path";
import { paths } from "../paths";
import { ttsKey } from "@/lib/assetKeys";

/** Natural-voice audio cache: data/tts/<voice>/<key>.wav (shared by the server and the scripts; the online export uses the same keys). */
// turbopackIgnore: runtime folders — otherwise the build traces every WAV and the voice model into its output.
export const ttsDir = () =>
  process.env.TTS_CACHE_DIR ? path.resolve(/*turbopackIgnore: true*/ paths.root, process.env.TTS_CACHE_DIR) : path.join(/*turbopackIgnore: true*/ paths.root, "data", "tts");
export const modelsDir = () => path.join(/*turbopackIgnore: true*/ paths.root, "data", "models");

export function ttsFile(text: string, voice: string, speed: number) {
  return path.join(/*turbopackIgnore: true*/ ttsDir(), voice, `${ttsKey(text, speed)}.wav`);
}

/**
 * Online (Cloudflare) build only — next.config.ts points the home-only native packages here
 * (@napi-rs/canvas, pdfjs-dist, kokoro-js, @huggingface/transformers). Their features (book import, AI Studio
 * files, topic pictures, the voice engine) are refused online before they get here, so nothing below runs;
 * it only keeps native code out of the Worker.
 */
import { HOME_ONLY } from "@/lib/mode";

const homeOnly = (): never => {
  throw new Error(HOME_ONLY);
};

// @napi-rs/canvas
export const createCanvas = homeOnly;
export const loadImage = homeOnly;
// pdfjs-dist
export const getDocument = homeOnly;
export const OPS = {};
export const GlobalWorkerOptions = {};
// kokoro-js / @huggingface/transformers
export const KokoroTTS = { from_pretrained: homeOnly };
export const env = {};
export class RawAudio {
  constructor() {
    homeOnly();
  }
}

const stub = { createCanvas, loadImage, getDocument, OPS, GlobalWorkerOptions, KokoroTTS, env, RawAudio };
export default stub;

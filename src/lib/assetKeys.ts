import { sha1Hex } from "./sha1";
import { normalizeSpeech } from "./voices";
import { PLAN_VERSION, speechPlan } from "./speechPlan";
import { ONLINE_BASE } from "./mode";

/**
 * File names of the cached voice clips and book pictures. The home app keys its caches with these
 * (data/tts/<voice>/<key>.wav, resources/.cache/<book>/crops/<key>.webp) and the online version serves
 * the files exported from those caches under the same keys — so both sides must compute them the same way.
 */

/** A word or one plain sentence keeps its old key (its audio is unchanged); texts read in parts carry the plan version. */
export function ttsKey(text: string, speed: number) {
  const n = normalizeSpeech(text);
  const plan = speechPlan(n);
  const style = plan.length === 1 && plan[0].say === n ? "" : `${PLAN_VERSION}|`;
  return sha1Hex(`${style}${speed.toFixed(2)}|${n}`).slice(0, 20);
}

/** Longest side of a book picture in px (64–800, default 400). */
export const cropSize = (size: unknown) => Math.min(800, Math.max(64, Number(size) || 400));

export function cropKey(page: number, box: number[], size: number) {
  return sha1Hex(`${page}|${box.map((n) => n.toFixed(4)).join(",")}|${cropSize(size)}`).slice(0, 16);
}

/* Static files of the online version (public/online/…, written by `npm run online:export`). */
export const onlineVoiceUrl = (voice: string, text: string, speed: number) => `${ONLINE_BASE}/voice/${voice}/${ttsKey(text, speed)}.mp3`;
export const onlineCropUrl = (bookId: string, page: number, box: number[], size: number) => `${ONLINE_BASE}/books/${bookId}/crops/${cropKey(page, box, size)}.webp`;
export const onlineCoverUrl = (bookId: string) => `${ONLINE_BASE}/books/${bookId}/cover.png`;
export const onlineTopicPictureUrl = (topicId: string, slug: string, file: string) => `${ONLINE_BASE}/topics/${topicId}/${slug}/${file}`;

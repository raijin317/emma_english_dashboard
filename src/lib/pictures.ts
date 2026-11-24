import type { BookPicture, UnitExtractCore } from "./schemas/book";
import { ONLINE } from "./mode";
import { onlineCoverUrl, onlineCropUrl } from "./assetKeys";

/**
 * Book pictures: each unit word can point at its picture on a rendered book page.
 * Activities look pictures up by word (or by the word's emoji when no word is at hand)
 * in a PictureMap and fall back to the emoji.
 */
export type PictureMap = Record<string, string>;

/** "a Ball!" → "ball", "teddy bears" stays as written apart from case/punctuation. */
export function picKey(word: string) {
  return word
    .toLowerCase()
    .replace(/[“”"!?.,:;()]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(a|an|the) /, "");
}

/** Sizes the app asks for (the online export makes each picture in all of them). */
export const CROP_SIZES = [160, 320, 400] as const;

export function cropUrl(bookId: string, pic: BookPicture, size = 400) {
  if (ONLINE) return onlineCropUrl(bookId, pic.page, pic.box, size);
  return `/api/books/${bookId}/crop?p=${pic.page}&b=${pic.box.map((n) => n.toFixed(4)).join(",")}&s=${size}`;
}

/** The book's cover (page 1, small) — the child knows it from school. */
export function coverUrl(bookId: string) {
  return ONLINE ? onlineCoverUrl(bookId) : `/api/books/${bookId}/pages/1?thumb=1`;
}

/** Map of word → picture URL (plus emoji → URL when an emoji belongs to one word only). */
export function buildPictureMap(bookId: string, units: Pick<UnitExtractCore, "vocabulary">[]): PictureMap {
  const map: PictureMap = {};
  const emojiOwners = new Map<string, Set<string>>();
  for (const u of units)
    for (const v of u.vocabulary) {
      const k = picKey(v.word);
      if (v.emoji) emojiOwners.set(v.emoji, (emojiOwners.get(v.emoji) ?? new Set()).add(k));
    }
  for (const u of units)
    for (const v of u.vocabulary) {
      if (!v.pic) continue;
      const url = cropUrl(bookId, v.pic);
      const k = picKey(v.word);
      map[`w:${k}`] ??= url;
      if (v.emoji && emojiOwners.get(v.emoji)?.size === 1) map[`e:${v.emoji}`] ??= url;
    }
  return map;
}

/** Finds the picture for a word (preferred) or an emoji. */
export function lookupPicture(map: PictureMap | null | undefined, word?: string, emoji?: string): string | null {
  if (!map) return null;
  if (word) {
    const k = picKey(word);
    const hit = map[`w:${k}`] ?? (k.endsWith("s") ? (map[`w:${k.slice(0, -1)}`] ?? (k.endsWith("es") ? map[`w:${k.slice(0, -2)}`] : undefined)) : undefined);
    if (hit) return hit;
  }
  return (emoji && map[`e:${emoji}`]) || null;
}

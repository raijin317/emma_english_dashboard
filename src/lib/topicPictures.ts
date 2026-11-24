import { picKey, type PictureMap } from "./pictures";
import { ONLINE } from "./mode";
import { onlineTopicPictureUrl } from "./assetKeys";

/**
 * Pictures for the words of an AI Studio topic: an openly licensed picture from the web (picked by Claude,
 * with its credit) or a picture Claude drew. Stored per topic (inspiration_topics.pictures), files in data/topics/<id>/.
 */
export type PictureCredit = { title: string; creator: string; license: string; licenseUrl: string; url: string; provider: string };
export type TopicPicture = { word: string; slug: string; file: string; source: "web" | "ai"; credit?: PictureCredit; v: number };
export type TopicPictures = Record<string, TopicPicture>;
export type TopicWord = { word: string; emoji: string; key: string; slug: string };

export const MAX_TOPIC_WORDS = 16;

/** Folder-safe, unique name for a word ("ice cream" → "ice-cream-3f2a9c"). */
export function wordSlug(key: string) {
  let h = 0;
  for (const c of key) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return `${key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "w"}-${(h >>> 0).toString(36).slice(0, 6)}`;
}

/** The words of a topic that have a picture today (an emoji next to a word or a picture-choice label), first seen first. */
export function topicWords(items: { data: unknown }[], max = MAX_TOPIC_WORDS): TopicWord[] {
  const out = new Map<string, TopicWord>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    const word = typeof o.word === "string" ? o.word : typeof o.label === "string" ? o.label : null;
    if (word && typeof o.emoji === "string" && word.trim().split(/\s+/).length <= 3) {
      const key = picKey(word);
      if (key && !out.has(key)) out.set(key, { word: word.trim(), emoji: o.emoji, key, slug: wordSlug(key) });
    }
    Object.values(o).forEach(walk);
  };
  items.forEach((i) => walk(i.data));
  return [...out.values()].slice(0, max);
}

export const topicPictureUrl = (topicId: string, p: Pick<TopicPicture, "slug" | "file" | "v">) =>
  `${ONLINE ? onlineTopicPictureUrl(topicId, p.slug, p.file) : `/api/topics/${topicId}/pictures/${p.slug}/${p.file}`}?v=${p.v}`;

/** The topic's pictures as a PictureMap for the players (by word, and by emoji when the emoji belongs to one word). */
export function topicPictureMap(topicId: string, pictures: TopicPictures, words: TopicWord[]): PictureMap {
  const map: PictureMap = {};
  const owners = new Map<string, Set<string>>();
  for (const w of words) owners.set(w.emoji, (owners.get(w.emoji) ?? new Set()).add(w.key));
  for (const [key, p] of Object.entries(pictures)) {
    const url = topicPictureUrl(topicId, p);
    map[`w:${key}`] = url;
    const emoji = words.find((w) => w.key === key)?.emoji;
    if (emoji && owners.get(emoji)?.size === 1) map[`e:${emoji}`] = url;
  }
  return map;
}

/** "“Crab” by Jane, CC BY 2.0" */
export function creditText(c: PictureCredit) {
  const lic = c.license === "cc0" ? "CC0" : c.license === "pdm" ? "Public Domain" : `CC ${c.license.toUpperCase()}`;
  return `“${c.title || "Untitled"}”${c.creator ? ` by ${c.creator}` : ""} · ${lic}`;
}

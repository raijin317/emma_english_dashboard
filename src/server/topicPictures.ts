import fs from "node:fs";
import path from "node:path";
import { getAppSettings, getTopic, getTopicPictures, listItems, setTopicPictures } from "./repo";
import { paths } from "./paths";
import { runScript, isRunning } from "./scripts";
import { topicPictureMap, topicPictureUrl, topicWords, type PictureCredit } from "@/lib/topicPictures";
import type { PictureMap } from "@/lib/pictures";
import { REF_FILE, STYLE_SLUG, readStyle, refsSignature, styleRefs } from "./pictureStyle";

export { styleFromChat, addStyleRef, removeStyleRef, StyleProblem } from "./pictureStyle";

/**
 * AI Studio topic pictures, Next.js side: start the picture job (scripts/topic-pictures.ts) in the background,
 * report its progress, keep the style pictures, and let the parent choose another picture or the emoji
 * without asking Claude again.
 */
const SAFE = /^[A-Za-z0-9_-]{3,64}$/;
const SLUG = /^[a-z0-9-]{1,60}$/;
export const PICTURE_FILE = /^(c[1-9]\.jpg|ai\.png|sheet\.jpg)$/;

type JobState = { running: boolean; msg: string; progress: number; error?: string; finishedAt?: string };
const g = globalThis as unknown as { __sunnyPictureJobs?: Map<string, JobState> };
const jobs = (g.__sunnyPictureJobs ??= new Map());

const dirOf = (topicId: string) => {
  if (!SAFE.test(topicId)) throw new Error("Bad topic id");
  return path.join(paths.topicsDir, topicId);
};

/** Starts finding (or, with `draw`, redrawing one word's) pictures in the background. False when already running. */
export function startTopicPictures(topicId: string, o: { draw?: string } = {}) {
  const lock = `pictures:${topicId}`;
  if (isRunning(lock) || !getTopic(topicId)) return false;
  if (!o.draw && getAppSettings().topicPictures === "off") return false;
  const state: JobState = { running: true, msg: "Starting…", progress: 0 };
  jobs.set(topicId, state);
  void runScript(
    "topic-pictures.ts",
    [topicId, ...(o.draw ? ["--draw", o.draw] : [])],
    (event, d) => {
      if (typeof d.msg === "string") state.msg = d.msg;
      if (typeof d.progress === "number") state.progress = d.progress;
      if (event === "error") state.error = String(d.msg ?? "The picture search stopped.");
    },
    lock,
  ).then(() => {
    state.running = false;
    state.progress = 100;
    state.finishedAt = new Date().toISOString();
  });
  return true;
}

export function pictureJob(topicId: string): JobState | null {
  return jobs.get(topicId) ?? null;
}

type Saved = { n: number; file: string; credit: PictureCredit };
function candidates(topicId: string, slug: string): Saved[] {
  if (!SLUG.test(slug)) return [];
  try {
    return JSON.parse(fs.readFileSync(path.join(dirOf(topicId), slug, "candidates.json"), "utf8")) as Saved[];
  } catch {
    return [];
  }
}

/** Changes when a file is replaced (a new search writes c1.jpg… again), so the browser doesn't show an old copy. */
function version(topicId: string, slug: string, file: string) {
  try {
    return Math.round(fs.statSync(path.join(dirOf(topicId), slug, file)).mtimeMs);
  } catch {
    return 0;
  }
}

/** Everything the topic page shows: the style, per word its picture, its source/credit and the other pictures found. */
export function topicPicturesView(topicId: string) {
  const words = topicWords(listItems({ topicId }));
  const pics = getTopicPictures(topicId);
  const style = readStyle(topicId);
  return {
    mode: getAppSettings().topicPictures,
    job: pictureJob(topicId),
    style: {
      refs: styleRefs(topicId).map((file) => ({ file, url: topicPictureUrl(topicId, { slug: STYLE_SLUG, file, v: version(topicId, STYLE_SLUG, file) }) })),
      summary: style?.summary ?? null,
      from: style?.from ?? null,
      /** The drawings were made before the style pictures changed. */
      outdated: !!style && style.refs !== refsSignature(topicId),
    },
    words: words.map((w) => {
      const p = pics[w.key];
      return {
        key: w.key,
        word: w.word,
        emoji: w.emoji,
        picture: p ? { url: topicPictureUrl(topicId, p), source: p.source, credit: p.credit ?? null, file: p.file } : null,
        candidates: candidates(topicId, w.slug).map((c) => ({ n: c.n, file: c.file, url: topicPictureUrl(topicId, { slug: w.slug, file: c.file, v: version(topicId, w.slug, c.file) }), credit: c.credit })),
        drawn: fs.existsSync(path.join(dirOf(topicId), w.slug, "ai.png")),
      };
    }),
  };
}

/** The parent picks one of the web pictures found ("c3.jpg"), or Claude's drawing ("ai.png"), or the emoji (null). */
export function chooseTopicPicture(topicId: string, key: string, file: string | null) {
  const w = topicWords(listItems({ topicId })).find((x) => x.key === key);
  if (!w) return false;
  const pics = getTopicPictures(topicId);
  if (file === null) delete pics[key];
  else if (file === "ai.png") {
    if (!fs.existsSync(path.join(dirOf(topicId), w.slug, "ai.png"))) return false;
    pics[key] = { word: w.word, slug: w.slug, file, source: "ai", v: Date.now() };
  } else {
    const c = candidates(topicId, w.slug).find((x) => x.file === file);
    if (!c) return false;
    pics[key] = { word: w.word, slug: w.slug, file: c.file, source: "web", credit: c.credit, v: Date.now() };
  }
  setTopicPictures(topicId, pics);
  return true;
}

/** Absolute path of a picture file of a topic (validated), or null. */
export function topicPictureFile(topicId: string, slug: string, file: string) {
  if (!SAFE.test(topicId) || !SLUG.test(slug)) return null;
  if (slug === STYLE_SLUG ? !REF_FILE.test(file) : !PICTURE_FILE.test(file)) return null;
  const f = path.join(dirOf(topicId), slug, file);
  return fs.existsSync(f) ? f : null;
}

export function removeTopicPictures(topicId: string) {
  if (SAFE.test(topicId)) fs.rmSync(dirOf(topicId), { recursive: true, force: true });
}

/** The pictures the players use for a topic's items. */
export function picturesForTopic(topicId: string): PictureMap {
  const pics = getTopicPictures(topicId);
  if (!Object.keys(pics).length) return {};
  return topicPictureMap(topicId, pics, topicWords(listItems({ topicId })));
}

/** Up to n picture URLs of a topic (for its Bonus island). */
export function topicCovers(topicId: string, n = 1) {
  return Object.values(getTopicPictures(topicId))
    .slice(0, n)
    .map((p) => topicPictureUrl(topicId, p));
}

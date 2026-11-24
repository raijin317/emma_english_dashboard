/**
 * Pictures for the words of an AI Studio topic (run by scripts/topic-pictures.ts in its own process).
 *
 * "draw" (default) — Claude generates every picture:
 *   1. the style: Claude opens the parent's style pictures (data/topics/<topic>/style/ref-N.*, from the chat's
 *      attachments or added on the topic page) and writes the style down — or, without pictures, picks a style
 *      that fits the topic. Saved as style/style.json so later redraws match.
 *   2. Claude draws the words as SVG in that style, a few at a time (2 batches at once) → ai.png
 *   3. Claude looks at a numbered sheet of its drawings (and the style pictures) and redraws the ones a young
 *      child wouldn't recognize or that don't match the style (once).
 * "web" — Claude picks openly licensed pictures from Openverse and draws the rest (steps 1–3 for those).
 * "off" — the words keep their emoji.
 * Without Claude nothing is guessed: the words keep their emoji.
 */
import fs from "node:fs";
import path from "node:path";
import { getAppSettings, getTopic, getTopicPictures, listItems, setTopicPictures } from "./repo";
import { paths } from "./paths";
import { claudePictureDraw, claudePicturePick, claudePicturePlan, claudePictureReview, claudePictureStyle } from "./claude/jobs";
import { contactSheet, downloadPicture, searchPictures, svgToPng, type Candidate } from "./pictureSearch";
import { readStyle, refsSignature, saveStyle, styleDir, styleRefs, type SavedStyle } from "./pictureStyle";
import { topicWords, type PictureCredit, type TopicPicture, type TopicPictures, type TopicWord } from "@/lib/topicPictures";
import type { TopicPictureMode } from "@/lib/types";

export const topicDir = (topicId: string) => path.join(paths.topicsDir, topicId);
export const wordDir = (topicId: string, slug: string) => path.join(topicDir(topicId), slug);

type Log = (msg: string, progress?: number) => void;
type Topic = { title: string; description: string | null };
export type SavedCandidate = { n: number; file: string; credit: PictureCredit };

/**
 * Words per drawing call, calls at once, and at most this many redraws after the check.
 * Detailed styles make long SVGs: two words per call, three calls at once (measured: 4 pixel-art animals in one
 * call took 160 s; in two calls side by side about half).
 */
const BATCH = 2;
const PARALLEL = 3;
const MAX_REDRAW = 4;

/** The web candidates kept for a word (so the parent can choose another one without searching again). */
export function readCandidates(topicId: string, slug: string): SavedCandidate[] {
  try {
    return JSON.parse(fs.readFileSync(path.join(wordDir(topicId, slug), "candidates.json"), "utf8")) as SavedCandidate[];
  } catch {
    return [];
  }
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift()!);
  }));
}

const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, k) => a.slice(k * n, k * n + n));
const errText = (e: unknown) => (e as Error).message.slice(0, 160);

async function fetchCandidates(topicId: string, w: TopicWord, query: string): Promise<SavedCandidate[]> {
  const found: Candidate[] = await searchPictures(query);
  const dir = wordDir(topicId, w.slug);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^c\d+\.jpg$|^sheet\.jpg$|^candidates\.json$/.test(f)) fs.rmSync(path.join(dir, f));
  const got: { buf: Buffer; credit: PictureCredit }[] = [];
  const bufs = await Promise.all(found.map((c) => downloadPicture(c)));
  bufs.forEach((buf, k) => buf && got.push({ buf, credit: found[k].credit }));
  const saved = got.map((g, k) => {
    const file = `c${k + 1}.jpg`;
    fs.writeFileSync(path.join(dir, file), g.buf);
    return { n: k + 1, file, credit: g.credit };
  });
  fs.writeFileSync(path.join(dir, "candidates.json"), JSON.stringify(saved, null, 1));
  if (saved.length) fs.writeFileSync(path.join(dir, "sheet.jpg"), await contactSheet(got.map((g) => g.buf)));
  return saved;
}

/** The topic's drawing style: the saved one while the style pictures are unchanged, otherwise Claude works it out. */
export async function ensureStyle(topicId: string, topic: Topic, words: TopicWord[], log: Log, at: number): Promise<SavedStyle | null> {
  const sig = refsSignature(topicId);
  const saved = readStyle(topicId);
  if (saved && saved.refs === sig) return saved;
  const refs = styleRefs(topicId);
  log(refs.length ? `🎨 Claude is looking at your style picture${refs.length === 1 ? "" : "s"}…` : "🎨 Claude is choosing a picture style for this topic…", at);
  try {
    const s = await claudePictureStyle(
      topic,
      refs.map((f) => path.join(styleDir(topicId), f)),
      topicDir(topicId),
      words,
    );
    const out: SavedStyle = { ...s, from: refs.length ? "pictures" : "topic", refs: sig, at: new Date().toISOString() };
    saveStyle(topicId, out);
    return out;
  } catch (e) {
    log(`Claude could not work out the style (${errText(e)}) — drawing in the app's own style.`, at);
    return null;
  }
}

/** Claude draws the words (a few per call, two calls at once). Returns the words that got a picture. */
async function draw(topicId: string, topic: Topic, words: (TopicWord & { fix?: string })[], style: SavedStyle | null, out: TopicPictures, log: Log, at: number, span: number) {
  const drawn: TopicWord[] = [];
  if (!words.length) return drawn;
  let finished = 0;
  log(`🖌️ Claude is drawing ${words.length} picture${words.length === 1 ? "" : "s"}…`, at);
  await pool(chunks(words, BATCH), PARALLEL, async (batch) => {
    try {
      const { pictures } = await claudePictureDraw(topic, batch, style, { parallel: true });
      for (const w of batch) {
        const svg = pictures.find((p) => p.word.trim().toLowerCase() === w.word.toLowerCase())?.svg;
        const png = svg ? await svgToPng(svg) : null;
        if (!png) continue;
        const dir = wordDir(topicId, w.slug);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "ai.png"), png);
        fs.writeFileSync(path.join(dir, "ai.svg"), svg!);
        out[w.key] = { word: w.word, slug: w.slug, file: "ai.png", source: "ai", v: Date.now() };
        drawn.push(w);
      }
    } catch (e) {
      log(`Claude could not draw ${batch.map((w) => w.word).join(", ")}: ${errText(e)}`);
    }
    finished += batch.length;
    log(`🖌️ Drawn ${finished}/${words.length}`, at + Math.round((span * finished) / words.length));
  });
  // Batches finish in any order: keep the words' order (the check's sheet is numbered in it).
  const order = (w: TopicWord) => words.findIndex((x) => x.key === w.key);
  return drawn.sort((a, b) => order(a) - order(b));
}

/** Claude checks its drawings on one numbered sheet; returns the words to draw again, with what to change. */
async function review(topicId: string, topic: Topic, drawn: TopicWord[], style: SavedStyle | null, log: Log, at: number) {
  if (!drawn.length) return [];
  log("👀 Claude is checking its drawings…", at);
  const sheet = path.join(topicDir(topicId), "review.jpg");
  fs.writeFileSync(sheet, await contactSheet(drawn.map((w) => fs.readFileSync(path.join(wordDir(topicId, w.slug), "ai.png")))));
  const { reviews } = await claudePictureReview(topic, {
    sheet,
    words: drawn.map((w) => w.word),
    refs: styleRefs(topicId).map((f) => path.join(styleDir(topicId), f)),
    style,
    workDir: topicDir(topicId),
  }).catch((e) => {
    log(`Claude could not check the drawings (${errText(e)}).`, at);
    return { reviews: [] as { n: number; ok: boolean; fix?: string | null }[] };
  });
  return reviews
    .filter((r) => !r.ok && drawn[r.n - 1])
    .slice(0, MAX_REDRAW)
    .map((r) => ({ ...drawn[r.n - 1], fix: r.fix?.trim() || "make it clearer and easier for a young child to recognize" }));
}

export async function findTopicPictures(topicId: string, o: { only?: string[]; drawOnly?: boolean; mode?: TopicPictureMode; log?: Log } = {}) {
  const log: Log = o.log ?? (() => {});
  const topic = getTopic(topicId);
  if (!topic) throw new Error("Topic not found");
  const mode = o.drawOnly ? "draw" : (o.mode ?? getAppSettings().topicPictures);
  const all = topicWords(listItems({ topicId }));
  const words = o.only?.length ? all.filter((w) => o.only!.includes(w.key)) : all;
  const result: TopicPictures = {};
  let fixed = 0;
  const done = () => {
    // Merge into what is saved now (the parent may have changed other words meanwhile).
    // A full run replaces the words' pictures; a single "draw this" that fails keeps the old picture.
    const current = getTopicPictures(topicId);
    if (!o.drawOnly) for (const w of words) delete current[w.key];
    setTopicPictures(topicId, { ...current, ...result });
    return { words: words.length, web: Object.values(result).filter((p) => p.source === "web").length, drawn: Object.values(result).filter((p) => p.source === "ai").length, fixed };
  };
  if (mode === "off" || !words.length) return done();

  let toDraw: TopicWord[] = [];
  if (mode === "draw") toDraw = [...words];
  else {
    // 1. Plan.
    log(`🤔 Claude is choosing how to show ${words.length} words…`, 5);
    const p = await claudePicturePlan(topic, words).catch(() => ({ words: [] as { word: string; show: "web"; query?: string }[] }));
    const plan = words.map((w) => {
      const hit = p.words.find((x) => x.word.trim().toLowerCase() === w.word.toLowerCase());
      return { word: w, show: hit?.show ?? "web", query: (hit?.query || w.word).trim() };
    });

    // 2. Search the openly licensed library.
    const web = plan.filter((x) => x.show === "web");
    toDraw = plan.filter((x) => x.show === "draw").map((x) => x.word);
    const sheets: { word: TopicWord; query: string; count: number }[] = [];
    let searched = 0;
    let offline = false;
    await pool(web, 2, async (x) => {
      if (offline) return void toDraw.push(x.word);
      try {
        const saved = await fetchCandidates(topicId, x.word, x.query);
        if (saved.length) sheets.push({ word: x.word, query: x.query, count: saved.length });
        else toDraw.push(x.word);
      } catch {
        offline = true; // no internet (or the library is down): Claude draws instead
        toDraw.push(x.word);
      }
      log(`🔎 Looking for pictures: ${++searched}/${web.length}`, 10 + Math.round((searched / Math.max(1, web.length)) * 40));
    });

    // 3. Claude picks (or says none is good enough). Sheets in the words' order (searches finish in any order).
    sheets.sort((a, b) => words.indexOf(a.word) - words.indexOf(b.word));
    if (sheets.length) {
      log(`👀 Claude is looking at the pictures…`, 55);
      // If Claude can't look, nothing is picked blindly: the parent can still choose from the pictures found.
      const { picks } = await claudePicturePick(
        topic,
        sheets.map((s) => ({ word: s.word.word, query: s.query, sheet: path.join(wordDir(topicId, s.word.slug), "sheet.jpg"), count: s.count })),
        topicDir(topicId),
      ).catch(() => ({ picks: [] as { word: string; pick: number }[] }));
      for (const s of sheets) {
        const n = picks.find((x) => x.word.trim().toLowerCase() === s.word.word.toLowerCase())?.pick ?? 0;
        const c = readCandidates(topicId, s.word.slug).find((x) => x.n === n);
        if (c) result[s.word.key] = { word: s.word.word, slug: s.word.slug, file: c.file, source: "web", credit: c.credit, v: Date.now() } satisfies TopicPicture;
        else toDraw.push(s.word);
      }
    }
    toDraw.sort((a, b) => words.indexOf(a) - words.indexOf(b));
  }

  // Claude draws (in the topic's style), checks the drawings, and redraws the weak ones once.
  if (toDraw.length) {
    const web = mode === "web";
    const style = await ensureStyle(topicId, topic, toDraw, log, web ? 66 : 5);
    const drawn = await draw(topicId, topic, toDraw, style, result, log, web ? 70 : 15, web ? 15 : 60);
    if (!o.drawOnly && drawn.length) {
      const again = await review(topicId, topic, drawn, style, log, web ? 87 : 78);
      if (again.length) {
        log(`✏️ Claude is improving ${again.length} drawing${again.length === 1 ? "" : "s"}…`, web ? 90 : 82);
        fixed = (await draw(topicId, topic, again, style, result, log, web ? 90 : 82, web ? 8 : 15)).length;
      }
    }
  }
  log("✅ Pictures ready", 100);
  return done();
}

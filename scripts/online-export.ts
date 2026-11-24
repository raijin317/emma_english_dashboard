/**
 * npm run online:export [-- --json]
 * Writes the files of the online version into this project folder (docs/CLOUDFLARE.md) — only what children can use:
 *   content/online/snapshot.json            ready books, approved units, live lessons and topics, lesson rules, voice info
 *   public/online/books/<book>/cover.png    the book's cover (page 1)
 *   public/online/books/<book>/crops/*.webp the word pictures cut from the book (every size the app asks for)
 *   public/online/topics/<topic>/<word>/…   the pictures chosen for AI Studio topics
 *   public/online/voice/<voice>/*.mp3       the natural voice of every sentence (from the app's WAV cache, as MP3)
 * File names are the keys the app computes (src/lib/assetKeys.ts). Files no longer used are removed.
 * Drafts, book PDFs and pages, chats, attached files and the family's children/progress are never written.
 * ONLINE_OUT_DIR=<folder> writes somewhere else (tests).
 */
import fs from "node:fs";
import path from "node:path";
import { wavToMp3 } from "../src/server/tts/mp3";
import { getAppSettings, getLessonRules, getTopicPictures, listBooks, listItems, listTopics, listUnits } from "../src/server/repo";
import { makeCrop } from "../src/server/bookCrops";
import { paths, thumbFile } from "../src/server/paths";
import { ttsFile } from "../src/server/tts/cache";
import { topicPictureFile } from "../src/server/topicPictures";
import type { OnlineSnapshot } from "../src/server/snapshot";
import { CROP_SIZES } from "../src/lib/pictures";
import { cropKey, ttsKey } from "../src/lib/assetKeys";
import { appSpeakables, speakablesFor, speechUnits } from "../src/lib/speakables";
import { speechSpeed } from "../src/lib/voices";
import type { Book, InspirationTopic, Unit } from "../src/lib/types";

const json = process.argv.includes("--json");
const say = (o: { type?: string; msg: string; progress?: number } & Record<string, unknown>) => (json ? process.stdout.write(JSON.stringify({ type: "log", ...o }) + "\n") : console.log(o.msg));

const OUT = path.resolve(paths.root, process.env.ONLINE_OUT_DIR || ".");
const PUB = path.join(OUT, "public", "online");
const SNAPSHOT = path.join(OUT, "content", "online", "snapshot.json");

const keep = new Set<string>();
function copy(src: string, rel: string) {
  const dest = path.join(PUB, rel);
  keep.add(dest);
  if (fs.existsSync(dest) && fs.statSync(dest).size === fs.statSync(src).size) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

/** Deletes files of an earlier export that are no longer used, then empty folders. */
function prune(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      removed += prune(p);
      if (!fs.readdirSync(p).length) fs.rmdirSync(p);
    } else if (!keep.has(p)) {
      fs.rmSync(p);
      removed++;
    }
  }
  return removed;
}

const strip = <T extends object>(o: T, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k))) as T;

async function main() {
  say({ msg: "Collecting the live lessons…", progress: 1 });
  const books = listBooks().filter((b) => !b.isDemo);
  const units = books.flatMap((b) => listUnits(b.id).filter((u) => u.status === "approved"));
  const unitIds = new Set(units.map((u) => u.id));
  const topics = listTopics("approved");
  const topicIds = new Set(topics.map((t) => t.id));
  const items = listItems({ status: "approved" }).filter((i) => (i.unitId ? unitIds.has(i.unitId) : !!i.inspirationTopicId && topicIds.has(i.inspirationTopicId)));
  const usedBooks = books.filter((b) => units.some((u) => u.bookId === b.id));
  say({ msg: `${usedBooks.length} book(s), ${units.length} unit(s), ${items.length} lesson(s), ${topics.length} extra topic(s).`, progress: 3 });

  // Book pictures: the cover and every word picture in each size the app asks for.
  let pics = 0;
  let missingPics = 0;
  for (const b of usedBooks) {
    if (fs.existsSync(thumbFile(b.id, 1))) copy(thumbFile(b.id, 1), `books/${b.id}/cover.png`);
    for (const u of units.filter((x) => x.bookId === b.id))
      for (const v of u.extract.vocabulary) {
        if (!v.pic) continue;
        for (const size of CROP_SIZES) {
          const rel = `books/${b.id}/crops/${cropKey(v.pic.page, v.pic.box, size)}.webp`;
          if (keep.has(path.join(PUB, rel))) continue;
          const file = await makeCrop(b.id, v.pic.page, v.pic.box, size);
          if (file) {
            copy(file, rel);
            pics++;
          } else missingPics++;
        }
      }
  }
  say({ msg: `Book pictures: ${pics}${missingPics ? ` (${missingPics} missing — the book pages are not rendered)` : ""}.`, progress: 10 });

  // Topic pictures (drawn or chosen at home).
  const topicPics: Record<string, ReturnType<typeof getTopicPictures>> = {};
  let tp = 0;
  for (const t of topics) {
    const all = getTopicPictures(t.id);
    const kept: typeof all = {};
    for (const [key, p] of Object.entries(all)) {
      const src = topicPictureFile(t.id, p.slug, p.file);
      if (!src) continue;
      copy(src, `topics/${t.id}/${p.slug}/${p.file}`);
      kept[key] = p;
      tp++;
    }
    topicPics[t.id] = kept;
  }
  say({ msg: `Topic pictures: ${tp}.`, progress: 12 });

  // Voice: every sentence the players say, at the family's speed, from the app's cache (made by the app at home).
  const s = getAppSettings();
  const speak = speechUnits([...appSpeakables(), ...items.flatMap((i) => speakablesFor(i))]);
  let clips = 0;
  let made = 0;
  let missing = 0;
  for (let k = 0; k < speak.length; k++) {
    const u = speak[k];
    const speed = speechSpeed(s.childRate, u.slow);
    const dest = path.join(PUB, "voice", s.ttsVoice, `${ttsKey(u.text, speed)}.mp3`);
    if (keep.has(dest)) continue;
    const wav = ttsFile(u.text, s.ttsVoice, speed);
    if (fs.existsSync(dest)) {
      keep.add(dest);
      clips++;
    } else if (fs.existsSync(wav)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(`${dest}.tmp`, await wavToMp3(fs.readFileSync(wav)));
      fs.renameSync(`${dest}.tmp`, dest);
      keep.add(dest);
      clips++;
      made++;
    } else missing++;
    if (k % 50 === 0) say({ msg: `Voice ${k + 1}/${speak.length}…`, progress: 12 + Math.round((k / speak.length) * 83) });
  }
  say({ msg: `Voice (${s.ttsVoice}, speed ${s.childRate.toFixed(2)}): ${clips} clip(s), ${made} new${missing ? `, ${missing} sentence(s) not made yet at home` : ""}.`, progress: 95 });

  const removed = prune(PUB);
  const snapshot: OnlineSnapshot = {
    app: "emma-english-studio",
    version: 1,
    exportedAt: new Date().toISOString(),
    voice: clips ? { voice: s.ttsVoice, childRate: s.childRate, clips, missing } : null,
    lessonRules: getLessonRules(),
    books: usedBooks.map((b) => strip<Book>(b, ["unitCount", "approvedUnits", "readyUnits"])),
    units: units.map((u) => strip<Unit>(u, ["itemCount", "approvedItemCount"])),
    items,
    topics: topics.map((t) => ({ ...strip<InspirationTopic>(t, ["itemCount", "children"]), pictures: topicPics[t.id] ?? {} })),
  };
  fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
  fs.writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 1) + "\n");
  say({
    type: "done",
    msg: `✅ Online files ready${removed ? ` (${removed} old file(s) removed)` : ""}. Now commit and push the project — Cloudflare builds the online version again.`,
    progress: 100,
    books: usedBooks.length,
    items: items.length,
    topics: topics.length,
    pictures: pics + tp,
    clips,
    missing,
  });
}

main().catch((e) => {
  say({ type: "error", msg: (e as Error).message });
  process.exit(1);
});

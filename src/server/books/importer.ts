import fs from "node:fs";
import path from "node:path";
import { BookMeta, UnitExtractCore, type UnitExtract } from "@/lib/schemas/book";
import { assessBook } from "@/lib/assessment";
import { bookContentDir, bookPagesDir } from "../paths";
import { renderPdfPages } from "./render";
import { gradeHintFromName, type ScannedBook } from "./scan";
import { claudeBookOverview, claudeUnitExtract } from "../claude/jobs";
import { getBook, setBookStatus, upsertBook, upsertUnit, getUnit } from "../repo";

export type ImportLog = (msg: string, progress?: number) => void;

const MAX_PAGES_PER_CALL = 8;

function readJson<T>(file: string, parse: (v: unknown) => T): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return parse(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}
function writeJson(file: string, v: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(v, null, 2), "utf8");
}

export function mergeExtracts(parts: UnitExtractCore[]): UnitExtractCore {
  const [first, ...rest] = parts;
  const out: UnitExtractCore = structuredClone(first);
  for (const p of rest) {
    for (const v of p.vocabulary) if (!out.vocabulary.some((x) => x.word.toLowerCase() === v.word.toLowerCase())) out.vocabulary.push(v);
    for (const v of p.patterns) if (!out.patterns.some((x) => x.text === v.text)) out.patterns.push(v);
    for (const v of p.sentences) if (!out.sentences.includes(v)) out.sentences.push(v);
    for (const v of p.readings) if (!out.readings.some((x) => x.text === v.text)) out.readings.push(v);
    // A word seen again on a later page may bring the picture the first pass missed.
    for (const v of p.vocabulary) {
      const same = out.vocabulary.find((x) => x.word.toLowerCase() === v.word.toLowerCase());
      if (same && !same.pic && v.pic) same.pic = v.pic;
    }
    for (const v of p.phonics) if (!out.phonics.some((x) => x.focus === v.focus)) out.phonics.push(v);
    for (const v of p.songsChants) if (!out.songsChants.some((x) => x.title === v.title)) out.songsChants.push(v);
    out.skills = [...new Set([...out.skills, ...p.skills])];
    out.activityTypes = [...new Set([...out.activityTypes, ...p.activityTypes])];
    out.longestReadingWords = Math.max(out.longestReadingWords, p.longestReadingWords);
    out.confidence = Math.min(out.confidence, p.confidence);
    if (p.notes) out.notes = [out.notes, p.notes].filter(Boolean).join(" ");
  }
  return out;
}

/**
 * Full, resumable import of one book (PROJECT_SPEC §2.1):
 * render → overview → units → assessment. Each step writes to content/books/<bookId>/.
 */
export async function importBook(b: ScannedBook, opts: { force?: boolean; log?: ImportLog } = {}) {
  const log: ImportLog = opts.log ?? (() => {});
  const dir = bookContentDir(b.bookId);
  const pagesDir = bookPagesDir(b.bookId);
  if (opts.force) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const existing = getBook(b.bookId);
  upsertBook({
    id: b.bookId,
    fileName: b.relPath,
    fileHash: b.hash,
    title: existing?.title ?? b.fileName.replace(/\.pdf$/i, ""),
    grade: existing?.grade ?? gradeHintFromName(b.fileName),
    status: "rendering",
    statusDetail: "Preparing pages…",
  });

  try {
    // 1. Render pages
    log("Rendering pages…", 2);
    const pageCount = await renderPdfPages(b.file, pagesDir, {
      onPage: (p, total) => {
        if (p === total || p % 5 === 0) {
          log(`Rendered page ${p}/${total}`, 2 + Math.round((p / total) * 18));
          setBookStatus(b.bookId, "rendering", `Page ${p}/${total}`);
        }
      },
    });
    upsertBook({ id: b.bookId, fileName: b.relPath, title: getBook(b.bookId)!.title, pageCount });

    // 2. Overview
    const metaFile = path.join(dir, "book-meta.json");
    let meta = readJson(metaFile, (v) => BookMeta.parse(v));
    if (!meta) {
      setBookStatus(b.bookId, "reading", "Claude is reading the cover and contents…");
      log("Claude is reading the cover and contents pages…", 22);
      meta = await claudeBookOverview({ pagesDir, pageCount, fileName: b.fileName });
      if (meta.grade === null) meta.grade = gradeHintFromName(b.fileName);
      writeJson(metaFile, meta);
    }
    log(`Found “${meta.title}” with ${meta.units.length} units.`, 30);
    upsertBook({ id: b.bookId, fileName: b.relPath, title: meta.title, series: meta.series, bookType: meta.bookType, grade: meta.grade, meta, pageCount });

    // 3. Units
    const extracts: UnitExtract[] = [];
    for (const [i, u] of meta.units.entries()) {
      const unitId = `${b.bookId}-u${String(u.order).padStart(2, "0")}`;
      const unitFile = path.join(dir, "units", `${unitId}.json`);
      let core = readJson(unitFile, (v) => UnitExtractCore.parse(v));
      const pct = 30 + Math.round(((i + 1) / meta.units.length) * 62);
      if (!core) {
        setBookStatus(b.bookId, "extracting", `Unit ${i + 1}/${meta.units.length}: ${u.title}`);
        log(`Claude is reading unit ${u.order}: ${u.title} (pages ${u.startPage}–${u.endPage})…`, pct - 2);
        const pages = Array.from({ length: u.endPage - u.startPage + 1 }, (_, k) => u.startPage + k);
        const parts: UnitExtractCore[] = [];
        for (let k = 0; k < pages.length; k += MAX_PAGES_PER_CALL) {
          parts.push(await claudeUnitExtract({ pagesDir, pages: pages.slice(k, k + MAX_PAGES_PER_CALL), order: u.order, title: u.title, bookTitle: meta.title, grade: meta.grade }));
        }
        core = mergeExtracts(parts);
        writeJson(unitFile, core);
      }
      const extract: UnitExtract = { ...core, id: unitId, bookId: b.bookId, order: u.order, pages: [u.startPage, u.endPage] };
      // Units are ready to use right away; on a normal re-import the parent's edits are kept.
      const prev = getUnit(unitId);
      if (!prev || opts.force) upsertUnit(extract, "approved");
      extracts.push(prev && !opts.force ? prev.extract : extract);
      log(`Unit ${u.order}: ${core.vocabulary.length} words, ${core.patterns.length} patterns.`, pct);
    }

    // 4. Assessment
    const assessment = assessBook(meta.grade, extracts);
    writeJson(path.join(dir, "assessment.json"), assessment);
    upsertBook({
      id: b.bookId,
      fileName: b.relPath,
      title: meta.title,
      assessment,
      status: "needs-review",
      statusDetail: null,
      importedAt: new Date().toISOString(),
    });
    log(`Done: ${assessment.stage}, ages ${assessment.estimatedAge.min}–${assessment.estimatedAge.max} (${assessment.cefr}).`, 100);
    return { bookId: b.bookId, meta, assessment };
  } catch (e) {
    const msg = (e as Error).message;
    setBookStatus(b.bookId, "error", msg.slice(0, 500));
    log("Error: " + msg);
    throw e;
  }
}

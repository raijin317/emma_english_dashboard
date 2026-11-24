import { buildQuickPack } from "@/lib/quickPack";
import { PROFILES } from "@/lib/assessment";
import type { ContentType, PackItem } from "@/lib/schemas/content";
import type { Book, Unit } from "@/lib/types";
import { createItem, deleteItem, getBook, getLessonRules, listChildren, listItems, listUnits, setBookStatus, updateUnit } from "../repo";
import { claudePracticePack } from "../claude/jobs";
import { earlierGames, earlierLanguage, enforceRules } from "../content";
import { tx } from "../db";

/**
 * The learning resources of a unit ("bộ tài nguyên học"):
 * - language-heavy types are written by Claude from the unit's words/patterns at the book's level;
 * - word-based types (cards, games, worksheet) are built locally from the word list.
 * If Claude is not available or fails, everything is built locally (quick pack).
 */
export const CLAUDE_TYPES: ContentType[] = ["grammar", "reading", "listening", "speaking", "quiz", "lessonPlan", "test"];
export const LOCAL_TYPES: ContentType[] = ["vocabulary", "game", "worksheet"];

export type ResourceLog = (msg: string, progress?: number) => void;

export async function generateUnitResources(unit: Unit, book: Book, opts: { useClaude: boolean; log?: ResourceLog }) {
  const stage = book.assessment?.stage ?? "early-reader";
  const profile = book.assessment?.generationProfile ?? PROFILES[stage];
  const earlier = earlierLanguage(unit);
  const rules = getLessonRules();
  const local = buildQuickPack(unit.extract, profile, { seed: unit.id, reviewWords: earlier.wordCards, rules, games: earlierGames(unit) });

  let fromClaude: PackItem[] = [];
  let mode: "claude" | "local" = "local";
  if (opts.useClaude && book.assessment) {
    try {
      const child = listChildren().find((c) => c.bookIds.includes(book.id));
      const written = (
        await claudePracticePack({
          unit: unit.extract,
          earlier: { words: earlier.words, patterns: earlier.patterns },
          assessment: book.assessment,
          childAge: child?.age ?? null,
          types: CLAUDE_TYPES,
          rules,
        })
      ).filter((i) => CLAUDE_TYPES.includes(i.type)); // never duplicate the locally built types
      fromClaude = enforceRules(written, { unit, allowedWords: [...unit.extract.vocabulary.map((v) => v.word), ...earlier.words], rules, log: opts.log });
      mode = "claude";
    } catch (e) {
      opts.log?.(`Claude could not write unit ${unit.order} (${(e as Error).message.slice(0, 120)}) — using the offline builder.`);
    }
  }
  const claudeTypes = new Set(fromClaude.map((i) => i.type));
  // Local items for word-based types, plus any type Claude did not deliver.
  const items: { item: PackItem; by: "claude" | "parent" }[] = [
    ...local.filter((i) => LOCAL_TYPES.includes(i.type) || !claudeTypes.has(i.type)).map((item) => ({ item, by: "parent" as const })),
    ...fromClaude.map((item) => ({ item, by: "claude" as const })),
  ];
  const order = (t: ContentType) => ["vocabulary", "listening", "speaking", "grammar", "reading", "game", "quiz", "worksheet", "lessonPlan", "test"].indexOf(t);
  items.sort((a, b) => order(a.item.type) - order(b.item.type));

  tx(() => {
    for (const { item, by } of items) {
      createItem({ source: "book", bookId: unit.bookId, unitId: unit.id, inspirationTopicId: null, type: item.type, title: item.title, status: "approved", stage, data: item.data, createdBy: by });
    }
  });
  return { created: items.length, mode };
}

/** Makes the resources for every unit of a book (skips units that already have them unless `force`). */
export async function generateBookResources(bookId: string, opts: { force?: boolean; useClaude: boolean; log?: ResourceLog }) {
  const book = getBook(bookId);
  if (!book) throw new Error("Book not found");
  const units = listUnits(bookId);
  const log = opts.log ?? (() => {});
  let made = 0;
  for (const [i, unit] of units.entries()) {
    const pct = Math.round(((i + 1) / units.length) * 100);
    const existing = listItems({ unitId: unit.id });
    if (existing.length && !opts.force) {
      log(`Unit ${unit.order}: resources already there (${existing.length} items).`, pct);
      continue;
    }
    if (unit.extract.vocabulary.filter((v) => v.word.trim()).length < 3) {
      log(`Unit ${unit.order}: fewer than 3 words — skipped (add words in the unit page, then regenerate).`, pct);
      continue;
    }
    setBookStatus(bookId, "generating", `Making resources: unit ${i + 1}/${units.length}`);
    log(`Making resources for unit ${unit.order}: ${unit.title}…`, Math.max(0, pct - 1));
    if (opts.force) for (const it of existing) deleteItem(it.id);
    if (unit.status !== "approved") updateUnit(unit.id, { status: "approved" });
    const r = await generateUnitResources(unit, getBook(bookId)!, { useClaude: opts.useClaude, log });
    made++;
    log(`Unit ${unit.order}: ${r.created} items (${r.mode === "claude" ? "Claude + offline" : "offline"}).`, pct);
  }
  setBookStatus(bookId, "ready");
  return { units: units.length, made };
}

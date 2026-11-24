import { buildQuickPack } from "@/lib/quickPack";
import { PROFILES, assessBook } from "@/lib/assessment";
import type { ContentType, GameKind, PackItem } from "@/lib/schemas/content";
import type { Unit } from "@/lib/types";
import { RULE, ruleOn, type LessonRule } from "@/lib/rules";
import { bookTexts, isFromBook, wordsOutsideBook } from "@/lib/bookText";
import { gameHistory } from "@/lib/games";
import { createItem, getBook, getChild, getLessonRules, listChildren, listItems, listUnits, upsertBook } from "./repo";
import { claudePracticePack } from "./claude/jobs";
import type { ClaudeEvent } from "./claude/parser";

/** Recomputes the level/age assessment after the parent edits units or the grade. */
export function reassessBook(bookId: string) {
  const book = getBook(bookId);
  if (!book) return null;
  const units = listUnits(bookId);
  if (!units.length) return book;
  const assessment = assessBook(book.grade, units.map((u) => u.extract));
  upsertBook({ ...book, assessment });
  return getBook(bookId);
}

/** The mini games of the units before this one (oldest first), so the next unit gets different ones. */
export function earlierGames(unit: Unit) {
  const before = listUnits(unit.bookId)
    .filter((u) => u.order < unit.order)
    .sort((a, b) => a.order - b.order);
  return gameHistory(before.map((u) => listItems({ unitId: u.id, type: "game" }).map((i) => (i.data as { game: GameKind }).game)));
}

/** Words and patterns of the units before this one (for spiral review). */
export function earlierLanguage(unit: Unit) {
  const before = listUnits(unit.bookId).filter((u) => u.order < unit.order);
  return {
    words: [...new Set(before.flatMap((u) => u.extract.vocabulary.map((v) => v.word)))].slice(-60),
    patterns: [...new Set(before.flatMap((u) => u.extract.patterns.map((p) => p.text)))].slice(-15),
    wordCards: before.flatMap((u) => u.extract.vocabulary.filter((v) => v.emoji).map((v) => ({ word: v.word, emoji: v.emoji! }))).slice(-20),
  };
}

export type RuleLog = (msg: string) => void;

/**
 * Applies the family's rules to Claude's items: an item that uses words which are not in the book is dropped
 * (rule "book-only"), and so is a reading whose passage is not the book's own text (rule "book-reading").
 * The offline builder then makes those types from the book itself.
 */
export function enforceRules(items: PackItem[], o: { unit: Unit; allowedWords: string[]; rules: LessonRule[]; log?: RuleLog }) {
  const texts = bookTexts(o.unit.extract);
  return items.filter((it) => {
    if (ruleOn(o.rules, RULE.bookOnly)) {
      const outside = wordsOutsideBook(it, o.allowedWords);
      if (outside.length) {
        o.log?.(`Unit ${o.unit.order}: “${it.title}” used words that are not in the book (${outside.slice(0, 4).join(", ")}) — left out.`);
        return false;
      }
    }
    if (it.type === "reading" && ruleOn(o.rules, RULE.bookReading) && !isFromBook(it.data.passage, texts)) {
      o.log?.(`Unit ${o.unit.order}: the reading text was not the book's own — left out.`);
      return false;
    }
    return true;
  });
}

function saveDrafts(unit: Unit, stage: string, items: PackItem[], by: "claude" | "parent") {
  return items.map((it) =>
    createItem({ source: "book", bookId: unit.bookId, unitId: unit.id, inspirationTopicId: null, type: it.type, title: it.title, status: "draft", stage: stage as never, data: it.data, createdBy: by }),
  );
}

export function quickPackForUnit(unit: Unit) {
  const book = getBook(unit.bookId);
  const stage = book?.assessment?.stage ?? "early-reader";
  const profile = book?.assessment?.generationProfile ?? PROFILES[stage];
  const items = buildQuickPack(unit.extract, profile, { seed: unit.id + Date.now(), reviewWords: earlierLanguage(unit).wordCards, rules: getLessonRules(), games: earlierGames(unit) });
  return saveDrafts(unit, stage, items, "parent");
}

export async function claudePackForUnit(unit: Unit, o: { types: ContentType[]; extra?: string; childId?: string; onEvent?: (e: ClaudeEvent) => void; signal?: AbortSignal; log?: RuleLog }) {
  const book = getBook(unit.bookId);
  if (!book?.assessment) throw new Error("This book has no level assessment yet. Import or re-import it first.");
  const child = o.childId ? getChild(o.childId) : (listChildren().find((c) => c.bookIds.includes(unit.bookId)) ?? null);
  const e = earlierLanguage(unit);
  const rules = getLessonRules();
  const items = await claudePracticePack({
    unit: unit.extract,
    earlier: { words: e.words, patterns: e.patterns },
    assessment: book.assessment,
    childAge: child?.age ?? null,
    types: o.types,
    rules,
    extra: o.extra,
    onEvent: o.onEvent,
    signal: o.signal,
  });
  const kept = enforceRules(items, { unit, allowedWords: [...unit.extract.vocabulary.map((v) => v.word), ...e.words], rules, log: o.log });
  if (!kept.length) throw new Error("Claude's practice did not follow your lesson rules (it used words or texts that are not in the book). Try again, or use the ⚡ Quick pack.");
  return saveDrafts(unit, book.assessment.stage, kept, "claude");
}

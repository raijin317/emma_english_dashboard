import { buildPictureMap, cropUrl, type PictureMap } from "@/lib/pictures";
import { RULE, ruleOn } from "@/lib/rules";
import type { ContentItem, Unit } from "@/lib/types";
import { getLessonRules, getUnit, listUnits } from "./repo";
import { picturesForTopic } from "./topicPictures";

/**
 * Pictures from the book for a unit: its own words plus the earlier units' words (used for review),
 * or nothing when the parent switched the "book pictures" rule off.
 */
export function picturesForUnit(unit: Unit | null): PictureMap {
  if (!unit || !ruleOn(getLessonRules(), RULE.bookPictures)) return {};
  const all = listUnits(unit.bookId);
  // This unit first, so its pictures win when a word appears twice.
  const ordered = [unit, ...all.filter((u) => u.id !== unit.id && u.order < unit.order).reverse()];
  return buildPictureMap(unit.bookId, ordered.map((u) => u.extract));
}

/** Book items: the book's pictures. AI Studio items: the pictures found on the web / drawn for their topic. */
export function picturesForItem(item: Pick<ContentItem, "source" | "unitId" | "inspirationTopicId">): PictureMap {
  if (item.source === "book") return item.unitId ? picturesForUnit(getUnit(item.unitId)) : {};
  return item.inspirationTopicId ? picturesForTopic(item.inspirationTopicId) : {};
}

/** Up to `n` picture URLs of a unit's words, for covers and banners. */
export function unitCovers(unit: Unit, n = 4): string[] {
  return unit.extract.vocabulary.flatMap((v) => (v.pic ? [cropUrl(unit.bookId, v.pic, 320)] : [])).slice(0, n);
}

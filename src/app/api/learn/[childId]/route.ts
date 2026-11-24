import { route, ok, fail } from "@/server/api";
import { getBook, getLessonRules, getTopic, listItems, listUnits } from "@/server/repo";
import { family } from "@/server/family";
import { unitCovers } from "@/server/pictures";
import { topicCovers } from "@/server/topicPictures";
import { CHILD_TYPES } from "@/lib/contentMeta";
import { coverUrl } from "@/lib/pictures";
import { RULE, ruleOn } from "@/lib/rules";
import type { InspirationTopic } from "@/lib/types";

type Ctx = RouteContext<"/api/learn/[childId]">;

/** Everything the child's "My World" needs: the child's books with their ready resources (approved items only). */
export const GET = route<Ctx>(async (_req, ctx) => {
  const { childId } = await ctx.params;
  const child = await family().getChild(childId);
  if (!child) return fail("Child not found", 404);
  const playable = (items: ReturnType<typeof listItems>) =>
    items.filter((i) => CHILD_TYPES.includes(i.type)).map((i) => ({ id: i.id, type: i.type, title: i.title, data: i.type === "game" ? { game: (i.data as { game: string }).game } : undefined }));
  const bookPics = ruleOn(getLessonRules(), RULE.bookPictures);

  const books = child.bookIds
    .map(getBook)
    .filter((b) => b !== null)
    .map((book) => ({
      id: book.id,
      title: book.title,
      status: book.status,
      // The real cover (page 1) is what the child knows from school.
      cover: !book.isDemo && book.pageCount > 0 ? coverUrl(book.id) : null,
      units: listUnits(book.id)
        .filter((u) => u.status === "approved")
        .map((u) => ({
          id: u.id,
          order: u.order,
          title: u.title,
          topic: u.topic,
          emoji: u.extract.vocabulary.find((v) => v.emoji)?.emoji ?? "⭐",
          emojis: u.extract.vocabulary.flatMap((v) => (v.emoji ? [v.emoji] : [])).slice(0, 4),
          pics: bookPics ? unitCovers(u) : [],
          items: playable(listItems({ unitId: u.id, status: "approved" })),
        }))
        .filter((u) => u.items.length),
    }));
  // Only the inspiration topics the parent gave to this child (Children → Edit), and only when approved.
  const topics = child.topicIds
    .map(getTopic)
    .filter((t): t is InspirationTopic => t?.status === "approved")
    .map((t) => ({ id: t.id, title: t.title, emoji: t.emoji, pic: topicCovers(t.id)[0] ?? null, items: playable(listItems({ topicId: t.id, status: "approved" })) }))
    .filter((t) => t.items.length);
  const s = await family().settings();
  return ok({ child, books, topics, stats: await family().childStats(childId), settings: { breakMinutes: s.breakMinutes } });
});

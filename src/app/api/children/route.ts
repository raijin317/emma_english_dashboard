import { route, ok, fail, body } from "@/server/api";
import { getBook, getTopic } from "@/server/repo";
import { family } from "@/server/family";

export const GET = route(async () => {
  const kids = await family().listChildren();
  return ok({ children: await Promise.all(kids.map(async (c) => ({ ...c, stats: await family().childStats(c.id) }))) });
});

export const POST = route(async (req) => {
  const b = await body<{ id?: string; name?: string; avatar?: string; age?: number; bookIds?: string[]; topicIds?: string[]; activeBookId?: string | null; dailyGoalMinutes?: number }>(req);
  const name = b.name?.trim();
  const age = Number(b.age);
  if (!name) return fail("Please enter a name.");
  if (!Number.isInteger(age) || age < 2 || age > 14) return fail("Age should be between 2 and 14.");
  const bookIds = (Array.isArray(b.bookIds) ? b.bookIds : b.activeBookId ? [b.activeBookId] : []).filter((id) => typeof id === "string" && getBook(id));
  // Inspiration topics (AI Studio) are given to a child here — Children → Edit.
  const topicIds = Array.isArray(b.topicIds) ? b.topicIds.filter((id) => typeof id === "string" && getTopic(id)) : undefined;
  const child = await family().saveChild({
    id: b.id,
    name: name.slice(0, 30),
    avatar: b.avatar || "🐻",
    age,
    bookIds,
    topicIds,
    activeBookId: b.activeBookId ?? null,
    dailyGoalMinutes: Math.min(60, Math.max(5, Number(b.dailyGoalMinutes) || 15)),
  });
  return ok({ child });
});

import { route, ok, fail, body } from "@/server/api";
import { getItem } from "@/server/repo";
import { family } from "@/server/family";

export const POST = route(async (req) => {
  const b = await body<{ childId?: string; itemId?: string; score?: number; maxScore?: number; durationSec?: number; missed?: string[] }>(req);
  if (!b.childId || !(await family().getChild(b.childId))) return fail("Child not found", 404);
  if (!b.itemId || !getItem(b.itemId)) return fail("Item not found", 404);
  const max = Math.max(0, Number(b.maxScore) || 0);
  const score = Math.min(max, Math.max(0, Number(b.score) || 0));
  return ok(
    await family().recordAttempt({
      childId: b.childId,
      itemId: b.itemId,
      score,
      maxScore: max,
      durationSec: Math.min(3600, Number(b.durationSec) || 0),
      missed: Array.isArray(b.missed) ? b.missed.filter((m) => typeof m === "string").map((m) => m.slice(0, 60)) : [],
    }),
  );
});

import { z } from "zod";
import { route, ok, fail, body, localOnly } from "@/server/api";
import { getLessonRules, setLessonRules } from "@/server/repo";
import { DEFAULT_RULES, LessonRules } from "@/lib/rules";

/** The family's lesson rules, used whenever lessons are made from a book. */
export const GET = route(async () => ok({ rules: getLessonRules(), defaults: DEFAULT_RULES }));

export const PUT = route(localOnly(async (req) => {
  const b = await body<{ rules?: unknown; reset?: boolean }>(req);
  if (b.reset) return ok({ rules: setLessonRules(DEFAULT_RULES) });
  const parsed = LessonRules.safeParse(b.rules);
  if (!parsed.success) return fail("Please check the rules.", 400, z.prettifyError(parsed.error));
  return ok({ rules: setLessonRules(parsed.data) });
}));

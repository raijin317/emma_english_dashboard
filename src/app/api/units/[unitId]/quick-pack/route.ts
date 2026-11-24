import { route, ok, fail, localOnly } from "@/server/api";
import { getUnit } from "@/server/repo";
import { quickPackForUnit } from "@/server/content";

type Ctx = RouteContext<"/api/units/[unitId]/quick-pack">;

/** Offline practice pack (no AI) from the unit's words and patterns. */
export const POST = route<Ctx>(localOnly(async (_req, ctx) => {
  const { unitId } = await ctx.params;
  const unit = getUnit(unitId);
  if (!unit) return fail("Unit not found", 404);
  if (unit.extract.vocabulary.length < 3) return fail("This unit needs at least 3 words first.");
  const items = quickPackForUnit(unit);
  return ok({ created: items.length });
}));

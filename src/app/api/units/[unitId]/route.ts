import { route, ok, fail, body, localOnly } from "@/server/api";
import { getBook, getUnit, listItems, listUnits, updateUnit } from "@/server/repo";
import { reassessBook } from "@/server/content";
import { UnitExtract } from "@/lib/schemas/book";
import { z } from "zod";

type Ctx = RouteContext<"/api/units/[unitId]">;

export const GET = route<Ctx>(async (_req, ctx) => {
  const { unitId } = await ctx.params;
  const unit = getUnit(unitId);
  if (!unit) return fail("Unit not found", 404);
  const siblings = listUnits(unit.bookId).map((u) => ({ id: u.id, order: u.order, title: u.title }));
  return ok({ unit, book: getBook(unit.bookId), items: listItems({ unitId }), siblings });
});

export const PATCH = route<Ctx>(localOnly(async (req, ctx) => {
  const { unitId } = await ctx.params;
  const unit = getUnit(unitId);
  if (!unit) return fail("Unit not found", 404);
  const b = await body<{ extract?: unknown; status?: "approved" | "needs-review" }>(req);
  if (b.extract !== undefined) {
    const parsed = UnitExtract.safeParse({ ...(b.extract as object), id: unit.id, bookId: unit.bookId, order: unit.order, pages: unit.pages });
    if (!parsed.success) return fail("Please check the unit details.", 400, z.prettifyError(parsed.error));
    updateUnit(unitId, { extract: parsed.data });
  }
  if (b.status) updateUnit(unitId, { status: b.status });
  reassessBook(unit.bookId);
  return ok({ unit: getUnit(unitId) });
}));

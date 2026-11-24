import { route, sse, fail, localOnly } from "@/server/api";
import { deleteItem, getBook, getUnit, listItems } from "@/server/repo";
import { generateUnitResources } from "@/server/books/resources";
import { claudeStatus } from "@/server/claude/bridge";

type Ctx = RouteContext<"/api/units/[unitId]/resources">;

/** Remakes the whole learning-resource set of one unit (replaces its current items). */
export const POST = route<Ctx>(localOnly(async (req, ctx) => {
  const { unitId } = await ctx.params;
  const unit = getUnit(unitId);
  const book = unit ? getBook(unit.bookId) : null;
  if (!unit || !book) return fail("Unit not found", 404);
  if (unit.extract.vocabulary.filter((v) => v.word.trim()).length < 3) return fail("This unit needs at least 3 words first.");
  return sse(async (send) => {
    const useClaude = (await claudeStatus()).ok;
    send("status", { message: useClaude ? "Claude is writing this unit's lessons…" : "Making lessons with the offline builder…" });
    const old = listItems({ unitId });
    const r = await generateUnitResources(unit, book, { useClaude, log: (msg) => send("status", { message: msg }) });
    for (const it of old) deleteItem(it.id);
    send("done", { created: r.created, mode: r.mode });
  }, req);
}));

import { route, ok, fail, body } from "@/server/api";
import { getBook } from "@/server/repo";
import { family } from "@/server/family";
import { childFit } from "@/lib/assessment";

type Ctx = RouteContext<"/api/children/[childId]">;

export const GET = route<Ctx>(async (_req, ctx) => {
  const { childId } = await ctx.params;
  const child = await family().getChild(childId);
  if (!child) return fail("Child not found", 404);
  const books = child.bookIds.map(getBook).filter((b) => b !== null);
  const book = books.find((b) => b.id === child.activeBookId) ?? null;
  return ok({
    child,
    stats: await family().childStats(childId),
    book,
    fit: book?.assessment ? childFit(child.age, book.assessment) : null,
    books: books.map((b) => ({ id: b.id, title: b.title, fit: b.assessment ? childFit(child.age, b.assessment) : null })),
  });
});

/** The child switches the book shown in their world. */
export const PATCH = route<Ctx>(async (req, ctx) => {
  const { childId } = await ctx.params;
  const b = await body<{ activeBookId?: string }>(req);
  if (b.activeBookId) await family().setActiveBook(childId, b.activeBookId);
  return ok({ child: await family().getChild(childId) });
});

export const DELETE = route<Ctx>(async (_req, ctx) => {
  const { childId } = await ctx.params;
  await family().deleteChild(childId);
  return ok({ ok: true });
});

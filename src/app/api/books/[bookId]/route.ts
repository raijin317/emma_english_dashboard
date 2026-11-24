import { route, ok, fail, body, localOnly } from "@/server/api";
import { deleteBook, getBook, listUnits, upsertBook } from "@/server/repo";
import { reassessBook } from "@/server/content";

type Ctx = RouteContext<"/api/books/[bookId]">;

export const GET = route<Ctx>(async (_req, ctx) => {
  const { bookId } = await ctx.params;
  const book = getBook(bookId);
  if (!book) return fail("Book not found", 404);
  return ok({ book, units: listUnits(bookId) });
});

export const PATCH = route<Ctx>(localOnly(async (req, ctx) => {
  const { bookId } = await ctx.params;
  const book = getBook(bookId);
  if (!book) return fail("Book not found", 404);
  const b = await body<{ title?: string; grade?: number | null; status?: "ready" | "needs-review" }>(req);
  upsertBook({
    ...book,
    title: b.title?.trim() || book.title,
    grade: b.grade === undefined ? book.grade : b.grade,
    status: b.status ?? book.status,
  });
  return ok({ book: reassessBook(bookId) });
}));

export const DELETE = route<Ctx>(localOnly(async (_req, ctx) => {
  const { bookId } = await ctx.params;
  deleteBook(bookId);
  return ok({ ok: true });
}));

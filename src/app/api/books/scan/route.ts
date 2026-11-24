import { route, ok, localOnly } from "@/server/api";
import { scanBooks } from "@/server/books/scan";
import { getBook } from "@/server/repo";
import { paths } from "@/server/paths";

export const GET = route(localOnly(async () => {
  const files = scanBooks().map((b) => {
    const known = getBook(b.bookId);
    return { ...b, file: undefined, status: known?.status ?? "new", title: known?.title ?? null };
  });
  return ok({ folder: paths.booksDir, files });
}));

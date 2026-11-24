import fs from "node:fs";
import { route, fail, localOnly } from "@/server/api";
import { pageFile, thumbFile } from "@/server/paths";

type Ctx = RouteContext<"/api/books/[bookId]/pages/[page]">;

/** Serves a rendered book page (family's own reference; never leaves this PC). */
export const GET = route<Ctx>(localOnly(async (req, ctx) => {
  const { bookId, page } = await ctx.params;
  const n = Number(page);
  if (!/^[a-z0-9-]+$/.test(bookId) || !Number.isInteger(n) || n < 1) return fail("Bad page", 400);
  const thumb = new URL(req.url).searchParams.get("thumb") === "1";
  const file = thumb ? thumbFile(bookId, n) : pageFile(bookId, n);
  if (!fs.existsSync(file)) return fail("Page not rendered", 404);
  return new Response(new Uint8Array(fs.readFileSync(file)), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" } });
}));

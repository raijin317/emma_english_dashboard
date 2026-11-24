import fs from "node:fs";
import { route, fail, localOnly } from "@/server/api";
import { makeCrop } from "@/server/bookCrops";
import { cropSize } from "@/lib/assetKeys";

type Ctx = RouteContext<"/api/books/[bookId]/crop">;

/**
 * A picture cut out of a rendered book page: ?p=<page>&b=<left,top,width,height as 0–1>&s=<max size px>.
 * Cached on disk next to the pages. (The online version serves the exported copies as static files.)
 */
export const GET = route<Ctx>(
  localOnly(async (req, ctx) => {
    const { bookId } = await ctx.params;
    const q = new URL(req.url).searchParams;
    const page = Number(q.get("p"));
    const box = (q.get("b") ?? "").split(",").map(Number);
    const size = cropSize(q.get("s"));
    if (!/^[a-z0-9-]+$/.test(bookId) || !Number.isInteger(page) || page < 1) return fail("Bad page", 400);
    if (box.length !== 4 || box.some((n) => !Number.isFinite(n) || n < 0 || n > 1) || box[2] <= 0 || box[3] <= 0) return fail("Bad box", 400);
    const file = await makeCrop(bookId, page, box, size);
    if (!file) return fail("Page not rendered", 404);
    return new Response(new Uint8Array(fs.readFileSync(file)), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=604800, immutable" } });
  }),
);

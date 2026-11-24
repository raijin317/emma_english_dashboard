import fs from "node:fs";
import { route, fail, localOnly } from "@/server/api";
import { topicPictureFile } from "@/server/topicPictures";

type Ctx = RouteContext<"/api/topics/[topicId]/pictures/[slug]/[file]">;

/** One picture of a topic (only from data/topics/<topicId>/<slug>/: c1–c9.jpg, ai.png, sheet.jpg; style/ref-N.jpg|png|webp). */
export const GET = route<Ctx>(localOnly(async (_req, ctx) => {
  const { topicId, slug, file } = await ctx.params;
  const f = topicPictureFile(topicId, slug, file);
  if (!f) return fail("Picture not found", 404);
  return new Response(new Uint8Array(fs.readFileSync(f)), {
    headers: {
      "Content-Type": file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : "image/jpeg",
      // The URL carries a version (?v=…) that changes when the picture changes.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}));

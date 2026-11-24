import { route, ok, fail, body, localOnly } from "@/server/api";
import { getTopic } from "@/server/repo";
import { StyleProblem, addStyleRef, pictureJob, removeStyleRef, topicPicturesView } from "@/server/topicPictures";

type Ctx = RouteContext<"/api/topics/[topicId]/style">;

/** Adds a style picture (multipart "file": JPG, PNG or WebP) — Claude draws the topic's pictures in its style. */
export const POST = route<Ctx>(localOnly(async (req, ctx) => {
  const { topicId } = await ctx.params;
  if (!getTopic(topicId)) return fail("Topic not found", 404);
  if (pictureJob(topicId)?.running) return fail("Pictures are being made right now — try again when they are ready.", 409);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("Please choose a picture.");
  try {
    addStyleRef(topicId, Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    if (e instanceof StyleProblem) return fail(e.message, 422);
    throw e;
  }
  return ok(topicPicturesView(topicId));
}));

/** { file: "ref-2.jpg" } — removes a style picture. */
export const DELETE = route<Ctx>(localOnly(async (req, ctx) => {
  const { topicId } = await ctx.params;
  if (!getTopic(topicId)) return fail("Topic not found", 404);
  if (pictureJob(topicId)?.running) return fail("Pictures are being made right now — try again when they are ready.", 409);
  const b = await body<{ file?: string }>(req);
  if (typeof b.file !== "string" || !removeStyleRef(topicId, b.file)) return fail("That style picture is not there.", 404);
  return ok(topicPicturesView(topicId));
}));

import { route, ok, fail, body, localOnly } from "@/server/api";
import { getTopic } from "@/server/repo";
import { chooseTopicPicture, pictureJob, startTopicPictures, topicPicturesView } from "@/server/topicPictures";

type Ctx = RouteContext<"/api/topics/[topicId]/pictures">;

/** The topic's words with their pictures, the other pictures found, and the background job's progress. */
export const GET = route<Ctx>(localOnly(async (_req, ctx) => {
  const { topicId } = await ctx.params;
  if (!getTopic(topicId)) return fail("Topic not found", 404);
  return ok(topicPicturesView(topicId));
}));

/**
 * { action: "find" }                 — look for pictures again (all words)
 * { action: "draw", key }            — Claude draws this word
 * { action: "choose", key, file }    — use a web picture found ("c2.jpg"), the drawing ("ai.png") or the emoji (file: null)
 */
export const POST = route<Ctx>(localOnly(async (req, ctx) => {
  const { topicId } = await ctx.params;
  if (!getTopic(topicId)) return fail("Topic not found", 404);
  const b = await body<{ action?: string; key?: string; file?: string | null }>(req);
  if (b.action === "find" || b.action === "draw") {
    if (pictureJob(topicId)?.running) return fail("Pictures are already being made for this topic.", 409);
    if (b.action === "draw" && !b.key) return fail("Which word?");
    if (!startTopicPictures(topicId, b.action === "draw" ? { draw: b.key } : {})) return fail("Pictures are switched off in Settings.", 409);
    return ok(topicPicturesView(topicId));
  }
  if (b.action === "choose" && typeof b.key === "string") {
    if (!chooseTopicPicture(topicId, b.key, typeof b.file === "string" ? b.file : null)) return fail("That picture is not there.", 404);
    return ok(topicPicturesView(topicId));
  }
  return fail("Unknown action");
}));

import { route, ok, fail, body, localOnly } from "@/server/api";
import { deleteTopic, getTopic, listItems, updateTopic } from "@/server/repo";
import { family } from "@/server/family";
import { warmVoices } from "@/server/tts/warm";
import { removeTopicPictures } from "@/server/topicPictures";

type Ctx = RouteContext<"/api/topics/[topicId]">;

export const GET = route<Ctx>(async (_req, ctx) => {
  const { topicId } = await ctx.params;
  const topic = getTopic(topicId);
  if (!topic) return fail("Topic not found", 404);
  return ok({ topic: { ...topic, children: await family().topicChildren(topicId) }, items: listItems({ topicId }) });
});

export const PATCH = route<Ctx>(
  localOnly(async (req, ctx) => {
    const { topicId } = await ctx.params;
    const b = await body<{ status?: "draft" | "approved"; title?: string }>(req);
    const topic = updateTopic(topicId, b);
    if (!topic) return fail("Topic not found", 404);
    if (b.status === "approved") warmVoices();
    return ok({ topic });
  }),
);

export const DELETE = route<Ctx>(
  localOnly(async (_req, ctx) => {
    const { topicId } = await ctx.params;
    deleteTopic(topicId);
    removeTopicPictures(topicId);
    return ok({ ok: true });
  }),
);

import { route, ok, fail, localOnly } from "@/server/api";
import { deleteThread, getThread, listMessages } from "@/server/repo";
import { removeStudioThread } from "@/server/studioFiles";

type Ctx = RouteContext<"/api/studio/threads/[threadId]">;

export const GET = route<Ctx>(localOnly(async (_req, ctx) => {
  const { threadId } = await ctx.params;
  const thread = getThread(threadId);
  if (!thread) return fail("Chat not found", 404);
  return ok({ thread, messages: listMessages(threadId) });
}));

export const DELETE = route<Ctx>(localOnly(async (_req, ctx) => {
  const { threadId } = await ctx.params;
  deleteThread(threadId);
  removeStudioThread(threadId);
  return ok({ ok: true });
}));

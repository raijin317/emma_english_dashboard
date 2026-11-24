import { route, ok, fail, localOnly } from "@/server/api";
import { getThread } from "@/server/repo";
import { addStudioFile, UploadProblem } from "@/server/studioFiles";

type Ctx = RouteContext<"/api/studio/threads/[threadId]/files">;

/** Attach one file to a chat: saved privately, then read into text + pictures for Claude. */
export const POST = route<Ctx>(localOnly(async (req, ctx) => {
  const { threadId } = await ctx.params;
  if (!getThread(threadId)) return fail("Chat not found", 404);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("Please choose a file.");
  try {
    return ok({ file: await addStudioFile(threadId, file) });
  } catch (e) {
    if (e instanceof UploadProblem) return fail(e.message, 422);
    throw e;
  }
}));

import { route, ok, body, localOnly } from "@/server/api";
import { createThread, listThreads } from "@/server/repo";

export const GET = route(localOnly(async () => ok({ threads: listThreads() })));

export const POST = route(localOnly(async (req) => {
  const b = await body<{ title?: string }>(req);
  return ok({ thread: createThread(b.title?.trim().slice(0, 60) || "New idea") });
}));

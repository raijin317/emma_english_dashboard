import { route, sse, body, fail, localOnly } from "@/server/api";
import { isRunning, runScript } from "@/server/scripts";

/** Pre-generates natural-voice audio (all approved lessons, or one book/topic), streamed as SSE. */
export const POST = route(localOnly(async (req) => {
  if (isRunning("tts")) return fail("Voices are already being prepared.", 409);
  const b = await body<{ target?: string }>(req);
  const target = (b.target || "all").replace(/[^\w-]/g, "");
  return sse((send) => runScript("tts-prepare.ts", [target], send, "tts"), req);
}));

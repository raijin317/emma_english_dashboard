import { route, sse, body, fail, localOnly } from "@/server/api";
import { isRunning, runScript } from "@/server/scripts";
import { warmVoices } from "@/server/tts/warm";

/**
 * Runs scripts/book-import.ts and streams its progress.
 * mode "import" (default): render → read units → assess → make the learning resources.
 * mode "resources": only (re)make the learning resources for a book that is already imported.
 */
export const POST = route(localOnly(async (req) => {
  if (isRunning("books")) return fail("A book job is already running. Please wait for it to finish.", 409);
  const b = await body<{ target?: string; force?: boolean; mode?: "import" | "resources" }>(req);
  const target = (b.target || "all").replace(/[^\w.\- ()/\\]/g, "");
  const args = [target, ...(b.force ? ["--force"] : []), ...(b.mode === "resources" ? ["--resources-only"] : [])];
  return sse(async (send) => {
    await runScript("book-import.ts", args, send, "books");
    warmVoices(); // anything the import's own voice step skipped is made in the background
  }, req);
}));

import { route, sse, fail, localOnly } from "@/server/api";
import { isRunning, runScript } from "@/server/scripts";

/** Home: writes the online version's files into this project folder (scripts/online-export.ts), streamed as SSE. */
export const POST = route(
  localOnly(async (req) => {
    if (isRunning("online-export")) return fail("The online files are already being prepared.", 409);
    return sse((send) => runScript("online-export.ts", [], send, "online-export"), req);
  }),
);

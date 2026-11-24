import { route, ok, localOnly } from "@/server/api";
import { claudeStatus } from "@/server/claude/bridge";

export const GET = route(localOnly(async () => ok(await claudeStatus())));

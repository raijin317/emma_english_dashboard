import { route, ok, fail, body } from "@/server/api";
import { family } from "@/server/family";
import { ONLINE } from "@/lib/mode";

/** Home: everything (children, progress, lessons, chats). Online: the family part (children, progress, PIN, settings). */
export const GET = route(async () => {
  const dump = await family().exportAll();
  const name = `emma-english-${ONLINE ? "online-" : ""}backup-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(dump, null, 1), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${name}"` } });
});

export const POST = route(async (req) => {
  const b = await body<{ app?: string; tables?: Record<string, Record<string, unknown>[]> }>(req);
  // "sunny-english-studio" = backups made before the app was renamed.
  if (!["emma-english-studio", "sunny-english-studio"].includes(b.app ?? "") || !b.tables) return fail("This is not an Emma English Studio backup file.");
  await family().importAll({ tables: b.tables });
  return ok({ ok: true });
});

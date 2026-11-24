import fs from "node:fs";
import path from "node:path";
import { route, ok } from "@/server/api";
import { paths } from "@/server/paths";
import { snapshotInfo, type OnlineSnapshot } from "@/server/snapshot";
import { ONLINE } from "@/lib/mode";

/** What the online version has: online = the lessons built into it; home = the files last prepared in this folder. */
export const GET = route(async () => {
  if (ONLINE) return ok(snapshotInfo());
  try {
    const s = JSON.parse(fs.readFileSync(path.join(/*turbopackIgnore: true*/ paths.root, "content", "online", "snapshot.json"), "utf8")) as OnlineSnapshot;
    return ok({ exportedAt: s.exportedAt, voice: s.voice, books: s.books.length, items: s.items.length, topics: s.topics.length });
  } catch {
    return ok({ exportedAt: null, voice: null, books: 0, items: 0, topics: 0 });
  }
});

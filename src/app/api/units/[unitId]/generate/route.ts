import { route, sse, body, fail, localOnly } from "@/server/api";
import { getUnit } from "@/server/repo";
import { claudePackForUnit } from "@/server/content";
import { ContentType } from "@/lib/schemas/content";
import { z } from "zod";

type Ctx = RouteContext<"/api/units/[unitId]/generate">;

/** Claude practice pack for one unit, streamed as Server-Sent Events. */
export const POST = route<Ctx>(localOnly(async (req, ctx) => {
  const { unitId } = await ctx.params;
  const unit = getUnit(unitId);
  if (!unit) return fail("Unit not found", 404);
  const b = await body<{ types?: string[]; extra?: string; childId?: string }>(req);
  const types = z.array(ContentType).min(1).safeParse(b.types);
  if (!types.success) return fail("Choose at least one content type.");

  return sse(async (send, signal) => {
    send("status", { message: "Claude is writing the practice pack…" });
    let chars = 0;
    const items = await claudePackForUnit(unit, {
      types: types.data,
      extra: b.extra?.slice(0, 500),
      childId: b.childId,
      signal,
      log: (message) => send("status", { message }),
      onEvent: (e) => {
        if (e.kind === "delta") {
          chars += e.text.length;
          send("progress", { chars });
        }
      },
    });
    send("done", { created: items.length, items: items.map((i) => ({ id: i.id, type: i.type, title: i.title })) });
  }, req);
}));

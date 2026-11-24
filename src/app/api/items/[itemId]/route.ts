import { z } from "zod";
import { route, ok, fail, body, localOnly } from "@/server/api";
import { deleteItem, getItem, getTopic, getUnit, updateItem } from "@/server/repo";
import { validateItemData } from "@/lib/schemas/content";
import { picturesForItem } from "@/server/pictures";
import { warmVoices } from "@/server/tts/warm";

type Ctx = RouteContext<"/api/items/[itemId]">;

export const GET = route<Ctx>(async (_req, ctx) => {
  const { itemId } = await ctx.params;
  const item = getItem(itemId);
  if (!item) return fail("Item not found", 404);
  const parent = item.unitId ? { kind: "unit" as const, id: item.unitId, title: getUnit(item.unitId)?.title ?? "" } : item.inspirationTopicId ? { kind: "topic" as const, id: item.inspirationTopicId, title: getTopic(item.inspirationTopicId)?.title ?? "" } : null;
  return ok({ item, parent, pictures: picturesForItem(item) });
});

export const PATCH = route<Ctx>(localOnly(async (req, ctx) => {
  const { itemId } = await ctx.params;
  const item = getItem(itemId);
  if (!item) return fail("Item not found", 404);
  const b = await body<{ title?: string; data?: unknown; status?: "draft" | "approved" }>(req);
  if (b.data !== undefined) {
    const r = validateItemData(item.type, b.data);
    if (!r.success) return fail("The content has problems.", 400, z.prettifyError(r.error));
    b.data = r.data;
  }
  const updated = updateItem(itemId, b);
  if (updated?.status === "approved") warmVoices(); // new or changed sentences get their voice in the background
  return ok({ item: updated });
}));

export const DELETE = route<Ctx>(localOnly(async (_req, ctx) => {
  const { itemId } = await ctx.params;
  deleteItem(itemId);
  return ok({ ok: true });
}));

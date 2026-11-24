import { route, ok } from "@/server/api";
import { listItems } from "@/server/repo";

export const GET = route(async (req) => {
  const p = new URL(req.url).searchParams;
  return ok({
    items: listItems({
      unitId: p.get("unitId") ?? undefined,
      topicId: p.get("topicId") ?? undefined,
      bookId: p.get("bookId") ?? undefined,
      status: p.get("status") ?? undefined,
      type: p.get("type") ?? undefined,
    }),
  });
});

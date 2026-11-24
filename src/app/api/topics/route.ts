import { z } from "zod";
import { route, ok, fail, body, localOnly } from "@/server/api";
import { createItem, createTopic, listItems, listTopics } from "@/server/repo";
import { family } from "@/server/family";
import { InspirationPack, type GameKind } from "@/lib/schemas/content";
import { tx } from "@/server/db";
import { startTopicPictures, styleFromChat } from "@/server/topicPictures";
import { topUpGames } from "@/server/gameRefresh";

export const GET = route(async (req) => {
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  const kids = await family().listChildren();
  const childrenOf = (id: string) => kids.filter((c) => c.topicIds.includes(id)).map((c) => ({ id: c.id, name: c.name, avatar: c.avatar }));
  return ok({ topics: listTopics(status).map((t) => ({ ...t, children: childrenOf(t.id) })) });
});

/** The game kinds of the existing topics, oldest first (so a new topic gets different games). */
function topicGames(): GameKind[][] {
  return listTopics()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((t) => listItems({ topicId: t.id, type: "game" }).map((i) => (i.data as { game: GameKind }).game));
}

/**
 * Saves an inspiration pack from AI Studio as a draft topic (never touches book content).
 * `threadId`: the chat it came from — its attached pictures become the style of the topic's drawings.
 */
export const POST = route(
  localOnly(async (req) => {
    const b = await body<{ pack?: unknown; threadId?: string }>(req);
    const parsed = InspirationPack.safeParse(b.pack);
    if (!parsed.success) return fail("This pack is not valid.", 400, z.prettifyError(parsed.error));
    const pack = parsed.data;
    // Every topic gets two mini games: when Claude made fewer, the app adds ones that fit the topic.
    const extra = topUpGames(pack.items, { title: pack.topic.title, description: pack.topic.description, stage: pack.topic.stage, seed: pack.topic.title, recent: topicGames() });
    const topic = tx(() => {
      const t = createTopic(pack.topic);
      for (const it of [...pack.items, ...extra]) {
        createItem({ source: "inspiration", bookId: null, unitId: null, inspirationTopicId: t.id, type: it.type, title: it.title, status: "draft", stage: pack.topic.stage, data: it.data, createdBy: extra.includes(it as never) ? "parent" : "claude" });
      }
      return t;
    });
    const style = typeof b.threadId === "string" ? styleFromChat(b.threadId, topic.id) : 0;
    // Pictures for the words, drawn by Claude in the style of the chat's pictures (or one that fits the topic), in the background.
    const pictures = startTopicPictures(topic.id);
    return ok({ topic, pictures, stylePictures: style, addedGames: extra.map((i) => i.title) });
  }),
);

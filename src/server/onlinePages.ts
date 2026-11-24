import { ONLINE } from "@/lib/mode";
import { PRINTABLE_TYPES } from "@/lib/contentMeta";
import { publishedIds } from "./snapshot";

/**
 * generateStaticParams of the lesson pages.
 * Online: every book, unit, topic and lesson of the snapshot gets its page prerendered at build time, so the Worker
 * serves it as a file (≈10 ms instead of ≈150 ms of rendering — the Workers Free plan allows 10 ms CPU per request).
 * Home: undefined — pages render on demand as before (with Cache Components an empty list would fail the build).
 */
const online = <T>(list: () => T[]) => (ONLINE ? async () => list() : undefined);

export const staticBooks = online(() => publishedIds().books.map((bookId) => ({ bookId })));
export const staticUnits = online(() => publishedIds().units.map((unitId) => ({ unitId })));
export const staticTopics = online(() => publishedIds().topics.map((topicId) => ({ topicId })));
export const staticItems = online(() => publishedIds().items.map((i) => ({ itemId: i.id })));
export const staticPrintables = online(() =>
  publishedIds()
    .items.filter((i) => PRINTABLE_TYPES.includes(i.type))
    .map((i) => ({ itemId: i.id })),
);

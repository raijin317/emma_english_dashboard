import raw from "../../content/online/snapshot.json";
import { mergeRules, type LessonRule } from "@/lib/rules";
import type { TopicPictures } from "@/lib/topicPictures";
import type { Book, ContentItem, InspirationTopic, Unit } from "@/lib/types";

/**
 * The lessons of the online version: content/online/snapshot.json, written at home by `npm run online:export`
 * (only what children can use: ready books, approved units, live items and topics) and built into the Worker.
 * Read-only — the online version never changes lessons.
 */
export type SnapshotVoice = {
  /** The natural voice the clips were made with, and the speed setting they were made for. */
  voice: string;
  childRate: number;
  /** Clips exported (MP3 in public/online/voice/<voice>/) and clips that were not made yet at home. */
  clips: number;
  missing: number;
};
export type SnapshotTopic = InspirationTopic & { pictures: TopicPictures };
export type OnlineSnapshot = {
  app: "emma-english-studio";
  version: 1;
  exportedAt: string | null;
  voice: SnapshotVoice | null;
  lessonRules: LessonRule[];
  books: Book[];
  units: Unit[];
  items: ContentItem[];
  topics: SnapshotTopic[];
};

const snap = raw as unknown as OnlineSnapshot;

const byCreated = (a: { createdAt: string }, b: { createdAt: string }) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);
const strip = <T extends object>(o: T, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k))) as T;

/** Ids of everything published (the online build prerenders a page for each, see onlinePages.ts). */
export const publishedIds = () => ({
  books: snap.books.map((b) => b.id),
  units: snap.units.map((u) => u.id),
  topics: snap.topics.map((t) => t.id),
  items: snap.items.map((i) => ({ id: i.id, type: i.type })),
});

export const snapshotInfo = () => ({ exportedAt: snap.exportedAt, voice: snap.voice, books: snap.books.length, items: snap.items.length, topics: snap.topics.length });
export const snapshotVoice = () => snap.voice;
export const lessonRules = (): LessonRule[] => mergeRules(snap.lessonRules);

export function listItems(f: { unitId?: string; topicId?: string; bookId?: string; status?: string; type?: string }): ContentItem[] {
  return snap.items
    .filter((i) => (!f.unitId || i.unitId === f.unitId) && (!f.topicId || i.inspirationTopicId === f.topicId) && (!f.bookId || i.bookId === f.bookId) && (!f.status || i.status === f.status) && (!f.type || i.type === f.type))
    .sort(byCreated);
}
export const getItem = (id: string) => snap.items.find((i) => i.id === id) ?? null;

const withCounts = (b: Book): Book => {
  const units = snap.units.filter((u) => u.bookId === b.id);
  const live = new Set(snap.items.filter((i) => i.bookId === b.id && i.status === "approved").map((i) => i.unitId));
  return { ...b, unitCount: units.length, approvedUnits: units.filter((u) => u.status === "approved").length, readyUnits: [...live].filter(Boolean).length };
};
export function listBooks(): Book[] {
  return snap.books
    .map(withCounts)
    .sort((a, b) => Number(a.isDemo) - Number(b.isDemo) || (a.grade ?? 99) - (b.grade ?? 99) || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
}
export function getBook(id: string): Book | null {
  const b = snap.books.find((x) => x.id === id);
  return b ? strip(b, ["unitCount", "approvedUnits", "readyUnits"]) : null;
}

const unitWithCounts = (u: Unit): Unit => {
  const items = snap.items.filter((i) => i.unitId === u.id);
  return { ...u, itemCount: items.length, approvedItemCount: items.filter((i) => i.status === "approved").length };
};
export const listUnits = (bookId: string): Unit[] => snap.units.filter((u) => u.bookId === bookId).sort((a, b) => a.order - b.order).map(unitWithCounts);
export function getUnit(id: string): Unit | null {
  const u = snap.units.find((x) => x.id === id);
  return u ? strip(u, ["itemCount", "approvedItemCount"]) : null;
}

const topicOf = (t: SnapshotTopic): InspirationTopic => strip(t, ["pictures", "itemCount", "children"]);
export function listTopics(status?: string): InspirationTopic[] {
  return snap.topics
    .filter((t) => !status || t.status === status)
    .sort((a, b) => -byCreated(a, b))
    .map((t) => ({ ...topicOf(t), itemCount: snap.items.filter((i) => i.inspirationTopicId === t.id).length }));
}
export function getTopic(id: string): InspirationTopic | null {
  const t = snap.topics.find((x) => x.id === id);
  return t ? topicOf(t) : null;
}
export const getTopicPictures = (id: string): TopicPictures => snap.topics.find((t) => t.id === id)?.pictures ?? {};

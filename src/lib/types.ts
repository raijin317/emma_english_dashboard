import type { BookAssessment, BookMeta, UnitExtract } from "./schemas/book";
import type { ContentItem, ContentType, Stage } from "./schemas/content";

export type { ContentItem, ContentType, Stage };

export type BookStatus = "new" | "rendering" | "reading" | "extracting" | "generating" | "needs-review" | "ready" | "error";

export type Book = {
  id: string;
  fileName: string;
  fileHash: string | null;
  title: string;
  series: string | null;
  bookType: string | null;
  grade: number | null;
  pageCount: number;
  status: BookStatus;
  statusDetail: string | null;
  meta: BookMeta | null;
  assessment: BookAssessment | null;
  isDemo: boolean;
  importedAt: string | null;
  unitCount?: number;
  approvedUnits?: number;
  /** Units that have at least one live lesson. */
  readyUnits?: number;
};

export type Unit = {
  id: string;
  bookId: string;
  order: number;
  title: string;
  topic: string | null;
  pages: [number, number];
  extract: UnitExtract;
  status: "needs-review" | "approved";
  itemCount?: number;
  approvedItemCount?: number;
};

export type InspirationTopic = {
  id: string;
  title: string;
  emoji: string;
  description: string | null;
  stage: Stage;
  status: "draft" | "approved";
  createdAt: string;
  itemCount?: number;
  /** Children this topic is given to (filled by the topics API). */
  children?: { id: string; name: string; avatar: string }[];
};

export type Child = {
  id: string;
  name: string;
  avatar: string;
  age: number;
  /** Books this child learns (each comes with its prepared resources). */
  bookIds: string[];
  /** The book shown first in the child's world (one of bookIds). */
  activeBookId: string | null;
  /** Inspiration topics (from AI Studio) given to this child — only these (when approved) show as Bonus islands. */
  topicIds: string[];
  dailyGoalMinutes: number;
  createdAt: string;
};

export type ChildStats = {
  totalStars: number;
  attempts: number;
  minutesToday: number;
  minutesWeek: number;
  /** Sticker ids owned, in album order (src/lib/stickers.ts). */
  stickers: string[];
  /** Sticker pages completed (one trophy each); the number of trophies is the child's level. */
  trophies: string[];
  level: number;
  completedItemIds: string[];
  bestStarsByItem: Record<string, number>;
  weakWords: { word: string; misses: number }[];
  week: { date: string; minutes: number; stars: number }[];
};

export type ChatThread = { id: string; title: string; claudeSessionId: string | null; createdAt: string; updatedAt: string };
export type ChatMessage = {
  id: string;
  threadId: string;
  role: "user" | "assistant" | "error";
  text: string;
  pack: unknown | null;
  /** Files the parent attached to this message (AI Studio). */
  files: StudioFile[];
  createdAt: string;
};

export type StudioFileKind = "image" | "pdf" | "word" | "excel" | "powerpoint" | "text";

/** A file attached in AI Studio, prepared so Claude can read it (data/studio/<thread>/<id>/). */
export type StudioFile = {
  id: string;
  name: string;
  kind: StudioFileKind;
  size: number;
  /** PDF pages, slides or sheets. */
  parts: number | null;
  /** Length of the text we could read from it. */
  chars: number;
  /** Pictures Claude can look at (img-01.jpg …), with what they show. */
  images: { file: string; label: string }[];
  thumb: string | null;
  note: string | null;
  createdAt: string;
};

export type AppSettings = {
  /** "natural" = Kokoro neural voice from the server; "browser" = Web Speech API. */
  ttsEngine: "natural" | "browser";
  ttsVoice: string;
  voiceName: string;
  childRate: number;
  soundOn: boolean;
  breakMinutes: number;
  hasPin: boolean;
  /** Pictures for AI Studio topics (all done by Claude): "draw" (default) = Claude draws every picture in the style of the
   *  parent's style pictures (or one that fits the topic); "web" = openly licensed pictures from the web picked by Claude,
   *  the rest drawn; "off" = emoji only. */
  topicPictures: TopicPictureMode;
};

export const TOPIC_PICTURE_MODES = ["web", "draw", "off"] as const;
export type TopicPictureMode = (typeof TOPIC_PICTURE_MODES)[number];

export const CONTENT_TYPES: ContentType[] = [
  "vocabulary",
  "grammar",
  "reading",
  "listening",
  "speaking",
  "worksheet",
  "quiz",
  "lessonPlan",
  "game",
  "test",
];

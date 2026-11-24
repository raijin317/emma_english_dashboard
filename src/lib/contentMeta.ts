import type { ContentType, GameKind, Stage } from "./schemas/content";
import { GAMES } from "./games";

type Meta = { label: string; kidLabel: string; icon: string; bg: string; soft: string; text: string; shadow: string };

/** One colour + icon per content type, used everywhere (PROJECT_SPEC §7). */
export const TYPE_META: Record<ContentType, Meta> = {
  vocabulary: { label: "Vocabulary", kidLabel: "Words", icon: "🃏", bg: "bg-sun", soft: "bg-sun-soft", text: "text-sun-deep", shadow: "#e09b00" },
  grammar: { label: "Grammar", kidLabel: "Sentences", icon: "🧩", bg: "bg-orange", soft: "bg-orange-soft", text: "text-orange-deep", shadow: "#d9480f" },
  reading: { label: "Reading", kidLabel: "Read", icon: "📖", bg: "bg-grass", soft: "bg-grass-soft", text: "text-grass-deep", shadow: "#2e7d32" },
  listening: { label: "Listening", kidLabel: "Listen", icon: "🎧", bg: "bg-sky", soft: "bg-sky-soft", text: "text-sky-deep", shadow: "#0277bd" },
  speaking: { label: "Speaking", kidLabel: "Speak", icon: "🎤", bg: "bg-berry", soft: "bg-berry-soft", text: "text-berry-deep", shadow: "#c2185b" },
  worksheet: { label: "Worksheet", kidLabel: "Worksheet", icon: "✏️", bg: "bg-sky", soft: "bg-sky-soft", text: "text-sky-deep", shadow: "#0277bd" },
  quiz: { label: "Quiz", kidLabel: "Quiz", icon: "⭐", bg: "bg-grape", soft: "bg-grape-soft", text: "text-grape-deep", shadow: "#6a3fb5" },
  lessonPlan: { label: "Home lesson", kidLabel: "Lesson", icon: "🧑‍🏫", bg: "bg-grass", soft: "bg-grass-soft", text: "text-grass-deep", shadow: "#2e7d32" },
  game: { label: "Game", kidLabel: "Play", icon: "🎮", bg: "bg-orange", soft: "bg-orange-soft", text: "text-orange-deep", shadow: "#d9480f" },
  test: { label: "Test", kidLabel: "Test", icon: "🏅", bg: "bg-berry", soft: "bg-berry-soft", text: "text-berry-deep", shadow: "#c2185b" },
};

/** Which types a child can open directly (worksheets/lesson plans are for the parent). */
export const CHILD_TYPES: ContentType[] = ["vocabulary", "listening", "speaking", "grammar", "reading", "game", "quiz", "test"];
export const PRINTABLE_TYPES: ContentType[] = ["worksheet", "lessonPlan", "test", "quiz", "vocabulary"];

export const STAGE_LABEL: Record<Stage, string> = {
  "pre-reader": "Pre-reader (3–5)",
  "early-reader": "Early reader (6–7)",
  "developing-reader": "Developing reader (8–9)",
  "independent-reader": "Independent reader (9–10)",
};

export const GAME_LABEL = Object.fromEntries(Object.entries(GAMES).map(([k, g]) => [k, g.label])) as Record<GameKind, string>;
export const GAME_ICON = Object.fromEntries(Object.entries(GAMES).map(([k, g]) => [k, g.icon])) as Record<GameKind, string>;

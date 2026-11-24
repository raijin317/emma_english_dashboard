import { z } from "zod";

/**
 * The family's "lesson rules": followed every time lessons are made from a book.
 * The four built-in rules also switch real behaviour (see RULE_EFFECT); the parent can edit their wording,
 * turn them off, and add their own rules (custom rules are passed to Claude as written).
 */
export const LessonRule = z.object({
  id: z.string().min(1).max(40),
  text: z.string().trim().min(1, "A rule can't be empty").max(600),
  on: z.boolean(),
});
export type LessonRule = z.infer<typeof LessonRule>;
export const LessonRules = z.array(LessonRule).max(30);

export const RULE = {
  bookOnly: "book-only",
  bookPictures: "book-pictures",
  bookReading: "book-reading",
  kidClear: "kid-clear",
} as const;

export const DEFAULT_RULES: LessonRule[] = [
  {
    id: RULE.bookOnly,
    on: true,
    text: "Stay inside the unit: use only the words, sentences and patterns this unit of the book teaches (words from earlier units are fine for review). Never invent new words or sentences that are not in the book.",
  },
  {
    id: RULE.bookPictures,
    on: true,
    text: "Show the book's own pictures for the unit words, so the child sees the same pictures as in class. Use an emoji only when the book has no picture for a word.",
  },
  {
    id: RULE.bookReading,
    on: true,
    text: "Reading uses the book's own reading texts and sentences, word for word (dialogues, chants, short texts) — not new stories.",
  },
  {
    id: RULE.kidClear,
    on: true,
    text: "Keep everything clear and easy for a young child: one idea at a time, very short instructions, familiar pictures, a few choices, cheerful feedback.",
  },
];

/** What each built-in rule does besides guiding Claude (shown in the rules page). */
export const RULE_EFFECT: Record<string, string> = {
  [RULE.bookOnly]: "Claude's items that use words outside the book are thrown away and made offline from the book's words instead.",
  [RULE.bookPictures]: "Pictures cut from the book pages replace the emoji in every activity, game and printout.",
  [RULE.bookReading]: "The Reading lesson shows the unit's reading text exactly as printed in the book.",
  [RULE.kidClear]: "Guides how Claude writes instructions, questions and feedback.",
};

export const isBuiltInRule = (id: string) => DEFAULT_RULES.some((r) => r.id === id);

/** Stored rules merged with the built-ins (built-ins can be edited or switched off, never lost). */
export function mergeRules(stored: unknown): LessonRule[] {
  const parsed = LessonRules.safeParse(stored);
  const list = parsed.success ? parsed.data : [];
  const out: LessonRule[] = DEFAULT_RULES.map((d) => list.find((r) => r.id === d.id) ?? d);
  for (const r of list) if (!isBuiltInRule(r.id) && !out.some((o) => o.id === r.id)) out.push(r);
  return out;
}

export function ruleOn(rules: LessonRule[], id: string) {
  return rules.find((r) => r.id === id)?.on ?? DEFAULT_RULES.find((r) => r.id === id)?.on ?? false;
}

/** Numbered list of the active rules, for prompts. */
export function rulesText(rules: LessonRule[]) {
  const on = rules.filter((r) => r.on);
  return on.length ? on.map((r, k) => `${k + 1}. ${r.text}`).join("\n") : "(none)";
}

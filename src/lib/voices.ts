/** Natural (Kokoro) American English voices offered to families. */
export const NATURAL_VOICES = [
  { id: "af_heart", label: "Heart", note: "warm & lively — best for kids", gender: "female" },
  { id: "af_bella", label: "Bella", note: "bright & friendly", gender: "female" },
  { id: "af_nova", label: "Nova", note: "clear teacher voice", gender: "female" },
  { id: "af_sky", label: "Sky", note: "soft & gentle", gender: "female" },
  { id: "am_puck", label: "Puck", note: "playful & fun", gender: "male" },
  { id: "am_michael", label: "Michael", note: "calm & kind", gender: "male" },
] as const;

export type NaturalVoiceId = (typeof NATURAL_VOICES)[number]["id"];
export const DEFAULT_VOICE: NaturalVoiceId = "af_heart";
export const isNaturalVoice = (v: string): v is NaturalVoiceId => NATURAL_VOICES.some((x) => x.id === v);

/** Normal and slow speaking speed for a given child speed setting. */
export function speechSpeed(childRate: number, slow: boolean) {
  const base = Math.min(1.2, Math.max(0.6, childRate));
  return Math.round((slow ? Math.max(0.55, base * 0.75) : base) * 100) / 100;
}

/**
 * How much faster (>1) or slower (<1) to play a natural-voice clip made at `clipRate` so it sounds at `childRate`.
 * Home: clips are made at the chosen speed (1). Online: the clips made at home are reused at any speed.
 */
export function clipPlaybackRate(childRate: number, clipRate: number, slow: boolean) {
  return speechSpeed(childRate, slow) / speechSpeed(clipRate, slow);
}

/** Tidies spaces but keeps line breaks (one blank line at most) — they tell the voice where to pause. */
export function normalizeSpeech(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Longest text the natural voice reads in one go (a long book passage). */
export const MAX_SPEECH_CHARS = 1000;

/** What Settings plays to try a voice (the online export makes its clip too). */
export const VOICE_SAMPLE = "Hello, friend! Look, a little green clover! It has four leaves. Can you say clover? Great job!";

/** Short cheerful lines used by the mascot and celebrations. */
export const PRAISE = {
  great: "Amazing! Great job!",
  good: "Well done!",
  try: "Good try! Let's practice again.",
} as const;

/** What the voice says when an answer is not right yet — the child picks again until it is. */
export const TRY_AGAIN = "Oops! Try again.";

/** Said when a sticker page is complete and the child wins its trophy. */
export const TROPHY_WON = "Wow! You won a trophy!";

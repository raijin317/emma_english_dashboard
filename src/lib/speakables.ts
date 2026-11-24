import type { ContentDataMap, ContentItem, QuizQuestion } from "./schemas/content";
import { MAX_SPEECH_CHARS, PRAISE, TROPHY_WON, TRY_AGAIN, VOICE_SAMPLE, normalizeSpeech } from "./voices";
import { speechPlan } from "./speechPlan";
import { ALBUM } from "./stickers";
import { gameSpeakables } from "./games";

/**
 * Every sentence the players can say for an item — used to prepare natural-voice audio ahead of time.
 * Keep in sync with the speak()/SpeakButton calls in src/features/players/*.
 */
export type Speakable = { text: string; slow: boolean };

function fromQuestion(q: QuizQuestion, out: Speakable[]) {
  const n = (text: string, slow = false) => out.push({ text, slow });
  switch (q.kind) {
    case "mc":
      n(q.prompt);
      q.options.forEach((o) => n(o));
      break;
    case "picture":
      n(q.prompt);
      n(q.prompt, true);
      break;
    case "tf":
      n(q.statement);
      break;
    case "fill":
      q.options.forEach((o) => n(q.sentence.replace("___", o)));
      break;
    case "match":
      n(q.prompt);
      q.pairs.forEach((p) => n(p.word));
      break;
    case "order":
      n(q.words.join(" "));
      break;
  }
}

export function speakablesFor(item: Pick<ContentItem, "type" | "data">): Speakable[] {
  const out: Speakable[] = [];
  const n = (text: string | undefined, slow = false) => text && out.push({ text, slow });
  const d = item.data as never;
  switch (item.type) {
    case "vocabulary":
      for (const w of (d as ContentDataMap["vocabulary"]).words) {
        n(w.word);
        n(w.word, true);
        n(w.example);
      }
      break;
    case "listening": {
      const l = d as ContentDataMap["listening"];
      for (const t of l.tasks) {
        n(t.say);
        n(t.say, true);
      }
      break;
    }
    case "speaking":
      for (const p of (d as ContentDataMap["speaking"]).prompts) {
        n(p.mode === "answer" && p.question ? p.question : p.text);
        n(p.text, true);
      }
      break;
    case "grammar": {
      const g = d as ContentDataMap["grammar"];
      g.examples.forEach((e) => n(e.text));
      g.practice.forEach((q) => fromQuestion(q, out));
      break;
    }
    case "reading": {
      const r = d as ContentDataMap["reading"];
      n(r.passage);
      new Set(r.passage.split(/\s+/).map((t) => t.replace(/[^\w'-]/g, "")).filter(Boolean)).forEach((w) => n(w));
      r.questions.forEach((q) => fromQuestion(q, out));
      break;
    }
    case "quiz":
      (d as ContentDataMap["quiz"]).questions.forEach((q) => fromQuestion(q, out));
      break;
    case "test":
      (d as ContentDataMap["test"]).sections.forEach((s) => s.questions.forEach((q) => fromQuestion(q, out)));
      break;
    case "game": {
      const g = d as ContentDataMap["game"];
      out.push(...gameSpeakables(g.game, g.words.map((w) => w.word)));
      break;
    }
  }
  return dedupe(out);
}

export function commonSpeakables(): Speakable[] {
  return [...Object.values(PRAISE), TRY_AGAIN, TROPHY_WON, ...ALBUM.flatMap((p) => [p.title, ...p.stickers.map((s) => s.name)])].map((text) => ({ text, slow: false }));
}

/** Everything the app says outside lessons: the players' common lines + the ▶ voice sample in Settings (voice warm-up, Prepare voices, the online export). */
export function appSpeakables(): Speakable[] {
  return [...commonSpeakables(), { text: VOICE_SAMPLE, slow: false }];
}

/**
 * What the voice engine actually makes: a text read in parts (a passage, "Hi. I'm Mai.") is played part by part,
 * so each part is its own clip — the first sentence plays at once, and a sentence shared by two lessons is made once.
 */
export function speechUnits(list: Speakable[]): Speakable[] {
  const seen = new Set<string>();
  const out: Speakable[] = [];
  for (const s of list) {
    // Exactly what the player asks the server for: each part's spoken text (labels, blanks and emoji already handled).
    for (const { say: text } of speechPlan(s.text)) {
      const key = `${s.slow}|${normalizeSpeech(text)}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ text: normalizeSpeech(text), slow: s.slow });
      }
    }
  }
  return out;
}

function dedupe(list: Speakable[]) {
  const seen = new Set<string>();
  return list
    .map((s) => ({ text: normalizeSpeech(s.text), slow: s.slow }))
    .filter((s) => s.text && s.text.length <= MAX_SPEECH_CHARS && !seen.has(`${s.slow}|${s.text}`) && seen.add(`${s.slow}|${s.text}`));
}

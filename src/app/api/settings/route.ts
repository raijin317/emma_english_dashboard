import { route, ok, body } from "@/server/api";
import { family } from "@/server/family";
import { isNaturalVoice } from "@/lib/voices";
import { warmState, warmVoices } from "@/server/tts/warm";
import { TOPIC_PICTURE_MODES } from "@/lib/types";
import { ONLINE } from "@/lib/mode";
import { snapshotVoice } from "@/server/snapshot";

export const GET = route(async () =>
  ok({
    settings: await family().settings(),
    // Online: the natural voice is the one made at home (null = no clips were published, only the browser voice).
    ...(ONLINE ? { onlineVoice: snapshotVoice() } : { voiceWarmUp: warmState() }),
  }),
);

export const PATCH = route(async (req) => {
  const b = await body<{ ttsEngine?: string; ttsVoice?: string; voiceName?: string; childRate?: number; soundOn?: boolean; breakMinutes?: number; topicPictures?: string }>(req);
  const before = await family().settings();
  const set: Record<string, string> = {};
  if (b.ttsEngine === "natural" || b.ttsEngine === "browser") set.ttsEngine = b.ttsEngine;
  if (typeof b.voiceName === "string") set.voiceName = b.voiceName.slice(0, 200);
  if (typeof b.soundOn === "boolean") set.soundOn = b.soundOn ? "1" : "0";
  if (b.breakMinutes !== undefined) set.breakMinutes = String(Math.min(90, Math.max(5, Number(b.breakMinutes) || 20)));
  // The natural voice and its speed are chosen at home (the online clips were made with them).
  if (!ONLINE) {
    if (typeof b.ttsVoice === "string" && isNaturalVoice(b.ttsVoice)) set.ttsVoice = b.ttsVoice;
    if (b.childRate !== undefined) set.childRate = String(Math.min(1.2, Math.max(0.6, Number(b.childRate) || 0.85)));
    if (TOPIC_PICTURE_MODES.includes(b.topicPictures as never)) set.topicPictures = b.topicPictures!;
  }
  await family().setSettings(set);
  const after = await family().settings();
  // A new voice or speed means new audio: make it in the background so taps stay quick.
  if (!ONLINE && (after.ttsEngine !== before.ttsEngine || after.ttsVoice !== before.ttsVoice || after.childRate !== before.childRate)) warmVoices();
  return ok({ settings: after });
});

"use client";

import { useEffect } from "react";
import { api } from "@/lib/client/api";
import { configureSpeech, loadVoices } from "@/lib/client/speech";
import { setSoundOn } from "@/lib/client/sfx";
import type { AppSettings } from "@/lib/types";

export function applySettings(s: AppSettings) {
  configureSpeech({ engine: s.ttsEngine, voice: s.ttsVoice, voiceName: s.voiceName, childRate: s.childRate });
  setSoundOn(s.soundOn);
}

/** Applies the family's voice/sound settings in the browser. */
export function SettingsSync() {
  useEffect(() => {
    void loadVoices();
    api<{ settings: AppSettings }>("/api/settings")
      .then(({ settings }) => applySettings(settings))
      .catch(() => {});
  }, []);
  return null;
}

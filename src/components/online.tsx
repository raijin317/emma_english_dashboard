"use client";

import type { ReactNode } from "react";
import { ONLINE } from "@/lib/mode";

/** Shown only in the home app (book import, AI Studio, making or changing lessons, the voice engine). */
export function HomeOnly({ children }: { children: ReactNode }) {
  return ONLINE ? null : <>{children}</>;
}

/** Shown only in the online version. */
export function OnlineOnly({ children }: { children: ReactNode }) {
  return ONLINE ? <>{children}</> : null;
}

/** The note at the top of the parent area online. */
export function OnlineBanner() {
  if (!ONLINE) return null;
  return (
    <div className="no-print mb-4 rounded-2xl border-2 border-sky bg-sky-soft px-4 py-2 text-sm" role="note">
      🌐 <b>Online version.</b> Lessons, pictures and voices are made in the app on your home computer and published here — they can be viewed but not changed online. Children, their progress, the PIN and
      the settings below are saved online.
    </div>
  );
}

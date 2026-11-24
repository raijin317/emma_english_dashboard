"use client";

import { createContext, useContext, type ReactNode } from "react";
import { lookupPicture, type PictureMap } from "@/lib/pictures";

const PicturesContext = createContext<PictureMap | null>(null);

/** Gives every <Pic> below it the book pictures of the current unit. */
export function PicturesProvider({ pictures, children }: { pictures?: PictureMap | null; children: ReactNode }) {
  return <PicturesContext.Provider value={pictures ?? null}>{children}</PicturesContext.Provider>;
}

export function usePicture(word?: string, emoji?: string) {
  return lookupPicture(useContext(PicturesContext), word, emoji);
}

/**
 * The book's own picture of a word when there is one, otherwise the emoji.
 * Sized in `em`, so it follows the surrounding text size (`text-7xl` etc.) exactly like the emoji did.
 */
export function Pic({ emoji, word, className = "", scale = 1.15 }: { emoji?: string; word?: string; className?: string; scale?: number }) {
  const url = usePicture(word, emoji);
  if (!url) return <>{emoji}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={word ?? ""}
      draggable={false}
      style={{ width: `${scale}em`, height: `${scale}em` }}
      className={`inline-block rounded-[0.14em] bg-white object-contain align-middle ${className}`}
    />
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { ContentDataMap, ContentItem } from "@/lib/schemas/content";
import { TYPE_META } from "@/lib/contentMeta";
import { BigButton, Celebration } from "@/components/kids";
import { api } from "@/lib/client/api";
import { prefetchSpeech, stopSpeaking } from "@/lib/client/speech";
import { commonSpeakables, speakablesFor } from "@/lib/speakables";
import type { PictureMap } from "@/lib/pictures";
import { PicturesProvider } from "@/components/Pic";
import { LessonPlanView } from "../print";
import { GamePlayer } from "./games";
import type { Outcome } from "./quiz";
import { GrammarPlayer, ListeningPlayer, QuizPlayer, ReadingPlayer, SpeakingPlayer, TestPlayer, VocabularyPlayer } from "./activities";

export function ActivityBody({
  item,
  onDone,
  showVi,
  pictures,
  prefetch = true,
  round = 0,
}: {
  item: ContentItem;
  onDone: (o: Outcome) => void;
  showVi?: boolean;
  pictures?: PictureMap | null;
  /** How many times the child pressed "Play again" (games shuffle differently each time). */
  round?: number;
  /** Off while the parent is still editing, so half-typed text isn't turned into audio. */
  prefetch?: boolean;
}) {
  // Warm up the natural voice for everything this activity can say (+ "Oops! Try again." and the praise lines).
  useEffect(() => {
    if (!prefetch) return;
    const ac = new AbortController();
    prefetchSpeech([...speakablesFor(item), ...commonSpeakables()], ac.signal);
    return () => ac.abort();
  }, [item, prefetch]);
  // …and the book pictures, so they appear instantly.
  useEffect(() => {
    for (const url of new Set(Object.values(pictures ?? {}))) new Image().src = url;
  }, [pictures]);
  return (
    <PicturesProvider pictures={pictures}>
      <Body item={item} onDone={onDone} showVi={showVi} round={round} />
    </PicturesProvider>
  );
}

function Body({ item, onDone, showVi, round = 0 }: { item: ContentItem; onDone: (o: Outcome) => void; showVi?: boolean; round?: number }) {
  const d = item.data as never;
  switch (item.type) {
    case "vocabulary":
      return <VocabularyPlayer data={d as ContentDataMap["vocabulary"]} onDone={onDone} showVi={showVi} />;
    case "listening":
      return <ListeningPlayer data={d} onDone={onDone} />;
    case "speaking":
      return <SpeakingPlayer data={d} onDone={onDone} />;
    case "grammar":
      return <GrammarPlayer data={d} onDone={onDone} />;
    case "reading":
      return <ReadingPlayer data={d} onDone={onDone} />;
    case "quiz":
      return <QuizPlayer data={d} onDone={onDone} />;
    case "test":
      return <TestPlayer data={d} onDone={onDone} />;
    case "game":
      // Another order on "Play again" (round), so a game doesn't repeat itself.
      return <GamePlayer data={d} onDone={onDone} seed={round ? `${item.id}#${round}` : item.id} stage={item.stage} />;
    case "lessonPlan":
      return <LessonPlanView title={item.title} data={d} />;
    case "worksheet":
      return <p className="text-center text-xl">Worksheets are printed by your parent ✏️</p>;
  }
}

/** Plays one item; records the attempt when a child is playing. */
export function ItemPlayer({ item, childId, onExit, onAgain, pictures }: { item: ContentItem; childId?: string | null; onExit?: () => void; onAgain?: () => void; pictures?: PictureMap | null }) {
  const [result, setResult] = useState<{ stars: number; newStickers: string[]; newTrophies?: string[]; level?: number } | null>(null);
  const [round, setRound] = useState(0);
  const started = useRef(0);
  const meta = TYPE_META[item.type];

  const done = async (o: Outcome) => {
    stopSpeaking();
    const ratio = o.max ? o.score / o.max : 1;
    const localStars = ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : 1;
    if (!childId) return setResult({ stars: localStars, newStickers: [] });
    try {
      const r = await api<{ stars: number; newStickers: string[]; newTrophies: string[]; level: number }>("/api/attempts", {
        body: { childId, itemId: item.id, score: o.score, maxScore: o.max, durationSec: started.current ? (Date.now() - started.current) / 1000 : 0, missed: o.missed },
      });
      setResult(r);
    } catch {
      setResult({ stars: localStars, newStickers: [] });
    }
  };

  useEffect(() => {
    started.current = Date.now();
  }, [round]);

  if (result)
    return (
      <Celebration stars={result.stars} newStickers={result.newStickers} newTrophies={result.newTrophies} level={result.level}>
        <div className="flex flex-wrap justify-center gap-3">
          <BigButton
            color="sun"
            onClick={() => {
              setResult(null);
              setRound((r) => r + 1);
              onAgain?.();
            }}
          >
            🔁 Play again
          </BigButton>
          {onExit && (
            <BigButton color="grass" onClick={onExit}>
              ✅ Back
            </BigButton>
          )}
        </div>
      </Celebration>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-center gap-3">
        <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl border-[3px] border-ink text-2xl ${meta.bg}`}>{meta.icon}</span>
        <h1 className="font-display text-3xl font-extrabold md:text-4xl">{item.title}</h1>
      </div>
      <ActivityBody key={round} item={item} onDone={done} pictures={pictures} round={round} />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { streamSSE, useApi } from "@/lib/client/api";

/** Runs a server job that streams {msg, progress} events and keeps a short log. */
export function useJob(onFinish?: () => void) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const ctrl = useRef<AbortController | null>(null);
  const run = async (url: string, body: unknown) => {
    const ac = new AbortController();
    ctrl.current = ac;
    setRunning(true);
    setLog([]);
    setProgress(0);
    try {
      await streamSSE(
        url,
        body,
        (event, data) => {
          const d = (data ?? {}) as { msg?: string; message?: string; progress?: number; book?: string; created?: number };
          if (d.progress !== undefined) setProgress(d.progress);
          const text = d.msg ?? d.message ?? (event === "done" && d.created !== undefined ? `✅ ${d.created} items made.` : undefined);
          if (text) setLog((l) => [...l.slice(-120), `${event === "error" ? "❌ " : ""}${d.book ? `[${d.book}] ` : ""}${text}`]);
        },
        ac.signal,
      );
    } catch (e) {
      if (!ac.signal.aborted) setLog((l) => [...l, "❌ " + (e as Error).message]);
    }
    setRunning(false);
    onFinish?.();
  };
  return { running, progress, log, run, cancel: () => ctrl.current?.abort() };
}

/** Progress bar + log of a job started with useJob. */
export function JobLog({ job }: { job: ReturnType<typeof useJob> }) {
  if (!job.running && !job.log.length) return null;
  return (
    <div className="mt-4">
      <ProgressBar value={job.progress} tone="bg-sky" />
      <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-ink p-3 text-sm text-cream">{job.log.join("\n")}</pre>
    </div>
  );
}
import { Badge, ProgressBar } from "@/components/ui";
import type { Fit } from "@/lib/assessment";
import { STAGE_INFO } from "@/lib/assessment";
import type { BookAssessment } from "@/lib/schemas/book";
import type { Book } from "@/lib/types";
import { coverUrl } from "@/lib/pictures";
import { ONLINE } from "@/lib/mode";

export function ClaudeStatusBadge({ compact = false }: { compact?: boolean }) {
  const { data, loading } = useApi<{ ok: boolean; version: string | null; error: string | null }>("/api/claude/status");
  if (loading) return <Badge tone="gray">Checking Claude…</Badge>;
  if (data?.ok) return <Badge tone="grass">🟢 Claude connected{compact ? "" : ` (${data.version})`}</Badge>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Badge tone="berry">🔴 Claude CLI not found</Badge>
      {!compact && (
        <Link href="/parent/settings#claude" className="text-sm font-bold underline">
          How to set up
        </Link>
      )}
    </span>
  );
}

export function useClaudeOk() {
  // Online there is no Claude (AI features are made at home).
  const { data } = useApi<{ ok: boolean }>(ONLINE ? null : "/api/claude/status");
  return data?.ok ?? false;
}

export function FitBadge({ fit }: { fit: Fit | null }) {
  if (!fit) return null;
  const t = { suitable: ["grass", "✅ Good fit"], challenging: ["orange", "⚠️ Challenging"], easy: ["sky", "💤 Easy"] } as const;
  const [tone, label] = t[fit.level];
  return (
    <span title={fit.reason}>
      <Badge tone={tone}>{label}</Badge>
    </span>
  );
}

export function AssessmentBadges({ a }: { a: BookAssessment | null }) {
  if (!a) return <Badge tone="gray">Not assessed yet</Badge>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge tone="sun">
        {STAGE_INFO[a.stage].emoji} {STAGE_INFO[a.stage].label}
      </Badge>
      <Badge tone="sky">
        Ages {a.estimatedAge.min}–{a.estimatedAge.max}
      </Badge>
      <Badge tone="grape">{a.cefr}</Badge>
    </span>
  );
}

export const STATUS_BADGE: Record<Book["status"], [string, "sun" | "sky" | "grass" | "berry" | "grape" | "orange" | "gray"]> = {
  new: ["New", "gray"],
  rendering: ["Preparing pages…", "sky"],
  reading: ["Reading contents…", "sky"],
  extracting: ["Reading units…", "sky"],
  generating: ["Making lessons…", "grape"],
  "needs-review": ["Lessons not made yet", "orange"],
  ready: ["Ready to learn", "grass"],
  error: ["Problem", "berry"],
};

export function BookCover({ book, className = "" }: { book: Book; className?: string }) {
  if (book.isDemo || !book.pageCount)
    return <div className={`flex items-center justify-center rounded-xl bg-sun-soft text-5xl ${className}`}>{book.isDemo ? "🌞" : "📘"}</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={coverUrl(book.id)} alt={`Cover of ${book.title}`} className={`rounded-xl border-2 border-line object-cover ${className}`} />;
}

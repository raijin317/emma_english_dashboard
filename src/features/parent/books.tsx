"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api, useApi } from "@/lib/client/api";
import { Badge, Button, EmptyState, LinkButton, PageHeader, Panel, inputCls } from "@/components/ui";
import { ErrorBox, Loading } from "@/components/kids";
import type { Book, Unit } from "@/lib/types";
import { STAGE_INFO } from "@/lib/assessment";
import { AssessmentBadges, BookCover, ClaudeStatusBadge, JobLog, STATUS_BADGE, useClaudeOk, useJob } from "./common";
import { PrepareVoices } from "./settings";
import { RulesNote } from "./rules";
import { cropUrl } from "@/lib/pictures";
import { HomeOnly } from "@/components/online";
import { ONLINE } from "@/lib/mode";

type ScanFile = { relPath: string; fileName: string; bookId: string; sizeMb: number; status: string; title: string | null };

/* ------------------------------ Import panel ------------------------------ */

export { JobLog };

function ImportPanel({ onDone }: { onDone: () => void }) {
  const scan = useApi<{ folder: string; files: ScanFile[] }>("/api/books/scan");
  const claudeOk = useClaudeOk();
  const job = useJob(() => {
    scan.reload();
    onDone();
  });
  const { running, log, progress } = job;
  const run = (target: string, force = false) => job.run("/api/books/import", { target, force });
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploadError(null);
    setUploading(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/books/upload", { method: "POST", body: fd });
      const d = (await res.json()) as { error?: string; bookId?: string | null; duplicate?: boolean };
      if (!res.ok) throw new Error(d.error ?? "Upload failed");
      scan.reload();
      setUploading(null);
      // Start reading the book and making its lessons right away.
      if (d.bookId && claudeOk) await run(d.bookId);
      else if (!claudeOk) setUploadError("The book was added, but Claude is not connected — see Settings, then press Import.");
    } catch (e) {
      setUploadError((e as Error).message);
      setUploading(null);
    }
  };

  const pending = scan.data?.files.filter((f) => f.status !== "ready") ?? [];
  return (
    <Panel title="📥 Add books" actions={<ClaudeStatusBadge compact />}>
      <p className="text-ink-soft">
        Choose your child&apos;s textbook (PDF). Claude reads every page, finds the units, then makes a full set of lessons for each unit (words, listening, speaking, grammar, reading, games, quiz, worksheet, lesson plan, test)
        and prepares the voice. A whole book can take 20–60 minutes — you can keep using the app meanwhile.
      </p>
      <div className="mt-2">
        <RulesNote />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="primary" className="min-h-14 px-6 text-lg" disabled={running || !!uploading} onClick={() => fileInput.current?.click()}>
          {uploading ? `Uploading ${uploading}…` : "📤 Upload a PDF book"}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          data-testid="book-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
        <span className="text-sm text-ink-soft">
          (or copy PDFs into <code className="rounded bg-cream px-1 break-all">{scan.data?.folder ?? "resources/book"}</code> and press 🔄 Scan folder)
        </span>
      </div>
      {uploadError && <p className="mt-2 font-bold text-berry-deep">❌ {uploadError}</p>}
      {scan.data && !scan.data.files.length && <p className="mt-3 font-bold">No book added yet.</p>}
      <ul className="mt-3 flex flex-col gap-2">
        {scan.data?.files.map((f) => (
          <li key={f.bookId} className="flex flex-wrap items-center gap-2 rounded-xl bg-cream px-3 py-2">
            <span className="font-bold">📄 {f.relPath}</span>
            <span className="text-sm text-ink-soft">{f.sizeMb} MB</span>
            <Badge tone={STATUS_BADGE[f.status as Book["status"]]?.[1] ?? "gray"}>{STATUS_BADGE[f.status as Book["status"]]?.[0] ?? f.status}</Badge>
            <span className="ml-auto flex gap-2">
              <Button disabled={running || !claudeOk} onClick={() => run(f.bookId)}>
                {f.status === "new" ? "Import" : "Continue"}
              </Button>
              {f.status !== "new" && (
                <Button disabled={running || !claudeOk} onClick={() => confirm("Read this book again from the start and remake all its lessons?") && run(f.bookId, true)}>
                  Re-import
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" disabled={running || !pending.length || !claudeOk} onClick={() => run("all")}>
          {running ? "Importing…" : `Import new books (${pending.length})`}
        </Button>
        <Button disabled={running} onClick={scan.reload}>
          🔄 Scan folder
        </Button>
      </div>
      {(running || log.length > 0) && <JobLog job={{ ...job, progress }} />}
    </Panel>
  );
}

/* -------------------------------- List -------------------------------- */

export function BooksPage() {
  const { data, error, reload } = useApi<{ books: Book[] }>("/api/books");
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader emoji="📚" title="Books" subtitle="Your child's textbooks — the source of all practice." />
      <HomeOnly>
        <ImportPanel onDone={reload} />
      </HomeOnly>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Loading />
      ) : !data.books.length ? (
        <EmptyState emoji="📚" title="No books yet" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.books.map((b) => (
            <Link key={b.id} href={`/parent/books/${b.id}`} className="flex gap-4 rounded-3xl border-2 border-line bg-paper p-4 shadow-[0_4px_0_0_#efe2c6] hover:border-sun">
              <BookCover book={b} className="h-32 w-24 shrink-0" />
              <div className="flex min-w-0 flex-col gap-2">
                <h2 className="text-xl font-extrabold">{b.title}</h2>
                <p className="text-sm text-ink-soft">
                  {[b.series, b.grade === 0 ? "Preschool" : b.grade ? `Grade ${b.grade}` : null, b.pageCount ? `${b.pageCount} pages` : null].filter(Boolean).join(" · ")}
                  {b.isDemo && " · demo content"}
                </p>
                <AssessmentBadges a={b.assessment} />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone={STATUS_BADGE[b.status][1]}>{STATUS_BADGE[b.status][0]}</Badge>
                  <span>
                    🎒 {b.readyUnits}/{b.unitCount} units with lessons
                  </span>
                </div>
                {b.status === "error" && b.statusDetail && <p className="text-sm text-berry-deep">{b.statusDetail}</p>}
                {["rendering", "reading", "extracting", "generating"].includes(b.status) && b.statusDetail && <p className="text-sm text-sky-deep">{b.statusDetail}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Detail ------------------------------- */

export function BookDetail({ bookId }: { bookId: string }) {
  const { data, error, reload } = useApi<{ book: Book; units: Unit[] }>(`/api/books/${bookId}`);
  const router = useRouter();
  const [page, setPage] = useState<number | null>(null);
  const [showPages, setShowPages] = useState(false);
  const job = useJob(reload);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const { book, units } = data;
  const a = book.assessment;
  const withLessons = units.filter((u) => (u.approvedItemCount ?? 0) > 0).length;
  const makeResources = (force: boolean) => job.run("/api/books/import", { target: bookId, mode: "resources", force });

  const setGrade = async (v: string) => {
    await api(`/api/books/${bookId}`, { method: "PATCH", body: { grade: v === "" ? null : Number(v) } });
    reload();
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <p className="text-sm font-bold text-ink-soft">
        <Link href="/parent/books" className="underline">
          Books
        </Link>{" "}
        › {book.title}
      </p>
      <PageHeader
        title={book.title}
        subtitle={<AssessmentBadges a={a} />}
        actions={
          <>
            {!book.isDemo && !ONLINE && (
              <Button
                variant="danger"
                onClick={async () => {
                  if (!confirm("Remove this book and all its practice items from the app? (The PDF file stays in resources/book.)")) return;
                  await api(`/api/books/${bookId}`, { method: "DELETE" });
                  router.push("/parent/books");
                }}
              >
                Remove
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Panel title="🎯 Level & age (from the book's content)">
          {a ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span className="text-5xl">{STAGE_INFO[a.stage].emoji}</span>
                <div>
                  <p className="text-2xl font-extrabold">
                    Suits ages {a.estimatedAge.min}–{a.estimatedAge.max}
                  </p>
                  <p className="text-ink-soft">
                    {STAGE_INFO[a.stage].label} · CEFR {a.cefr}
                  </p>
                </div>
              </div>
              <ul className="list-disc pl-6">
                {a.rationale.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-ink-soft">
                Practice is written with max {a.generationProfile.maxSentenceWords} words per sentence, {a.generationProfile.questionsPerQuiz} questions per quiz, {a.generationProfile.sessionMinutes}-minute
                sessions{a.generationProfile.allowWriting ? ", with writing" : ", no writing"}.
              </p>
            </>
          ) : (
            <p>Not assessed yet — finish the import first.</p>
          )}
        </Panel>
        <Panel title="⚙️ Book details">
          <label className="flex flex-col gap-1">
            <span className="font-bold">Grade</span>
            <select className={inputCls} value={book.grade ?? ""} disabled={ONLINE} onChange={(e) => setGrade(e.target.value)}>
              <option value="">Unknown</option>
              <option value="0">Preschool / Kindergarten</option>
              {[1, 2, 3, 4, 5].map((g) => (
                <option key={g} value={g}>
                  Grade {g}
                </option>
              ))}
            </select>
            <span className="text-sm text-ink-soft">{ONLINE ? "Change it in the app at home." : "Changing it updates the level assessment."}</span>
          </label>
          <p className="mt-3 text-sm text-ink-soft">File: {book.fileName}</p>
          {book.pageCount > 0 && !book.isDemo && !ONLINE && (
            <Button className="mt-3" onClick={() => setShowPages((s) => !s)}>
              📄 {showPages ? "Hide pages" : `View pages (${book.pageCount})`}
            </Button>
          )}
        </Panel>
      </div>

      {showPages && (
        <Panel title="📄 Pages (for your reference)">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-10">
            {Array.from({ length: book.pageCount }, (_, k) => (
              <button key={k} onClick={() => setPage(k + 1)} className="rounded-lg border-2 border-line hover:border-sun">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/books/${bookId}/pages/${k + 1}?thumb=1`} alt={`Page ${k + 1}`} loading="lazy" className="w-full rounded-md" />
                <span className="text-xs">{k + 1}</span>
              </button>
            ))}
          </div>
        </Panel>
      )}
      {page && <PageModal bookId={bookId} page={page} max={book.pageCount} onClose={() => setPage(null)} onGo={setPage} />}

      <Panel title="🎒 Learning resources">
        <p className="text-lg">
          <b>
            {withLessons}/{units.length}
          </b>{" "}
          units have a full set of lessons (words, listening, speaking, grammar, reading, games, quiz, worksheet, lesson plan, test).
        </p>
        <RulesNote />
        <HomeOnly>
          {book.status === "generating" && book.statusDetail && <p className="text-sky-deep">⏳ {book.statusDetail}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {withLessons < units.length && (
              <Button variant="grape" disabled={job.running} onClick={() => makeResources(false)}>
                ✨ Make lessons for {withLessons ? "the missing units" : "all units"}
              </Button>
            )}
            {withLessons > 0 && (
              <Button disabled={job.running} onClick={() => confirm("Remake ALL lessons of this book? Current lessons (and your edits) will be replaced.") && makeResources(true)}>
                ♻️ Remake all lessons
              </Button>
            )}
            {job.running && <Button onClick={job.cancel}>Stop watching</Button>}
          </div>
          <JobLog job={job} />
          <PrepareVoices target={bookId} label="🎙️ Prepare the voice for this book" />
        </HomeOnly>
      </Panel>

      <Panel title={`📗 Units (${units.length})`}>
        {!units.length && <p className="text-ink-soft">No units yet.</p>}
        <div className="flex flex-col gap-2">
          {units.map((u) => (
            <Link key={u.id} href={`/parent/units/${u.id}`} className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-line p-3 hover:border-sun">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sun font-display text-xl font-bold">{u.order}</span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 font-bold">
                  {u.extract.vocabulary.slice(0, 3).map((v, k) =>
                    v.pic ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={k} src={cropUrl(book.id, v.pic, 160)} alt={v.word} className="h-8 w-8 rounded-md border border-line bg-white object-contain" />
                    ) : (
                      <span key={k}>{v.emoji}</span>
                    ),
                  )}{" "}
                  {u.title}
                </p>
                <p className="text-sm text-ink-soft">
                  {u.extract.vocabulary.length} words · {u.extract.patterns.length} patterns · pages {u.pages[0]}–{u.pages[1]}
                  {u.extract.confidence < 0.6 && " · ⚠️ please check"}
                </p>
              </div>
              {(u.approvedItemCount ?? 0) > 0 ? <Badge tone="grass">🎒 {u.approvedItemCount} lessons</Badge> : <Badge tone="orange">No lessons yet</Badge>}
              {(u.itemCount ?? 0) > (u.approvedItemCount ?? 0) && <Badge tone="gray">{(u.itemCount ?? 0) - (u.approvedItemCount ?? 0)} hidden/draft</Badge>}
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function PageModal({ bookId, page, max, onClose, onGo }: { bookId: string; page: number; max: number; onClose: () => void; onGo: (p: number) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-ink/80 p-4" onClick={onClose} role="dialog" aria-label={`Page ${page}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/books/${bookId}/pages/${page}`} alt={`Page ${page}`} className="max-h-[85vh] max-w-full rounded-xl bg-white" onClick={(e) => e.stopPropagation()} />
      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        <Button disabled={page <= 1} onClick={() => onGo(page - 1)}>
          ◀
        </Button>
        <span className="rounded-xl bg-paper px-4 py-2 font-bold">
          {page} / {max}
        </span>
        <Button disabled={page >= max} onClick={() => onGo(page + 1)}>
          ▶
        </Button>
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

export function LinkToBooks() {
  return <LinkButton href="/parent/books">📚 Books</LinkButton>;
}

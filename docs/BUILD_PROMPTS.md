# Build Prompts — 01_Dashboard_English

Open the folder **`01_Dashboard_English`** in VS Code (File → Open Folder), then paste these into Claude Code **one phase at a time**.
Run the app and check the result after each phase before moving on.

## Status (2026-11-22)

| Phase | Status | Notes |
|---|---|---|
| 0 Scaffold | ✅ | Next.js 16.4 + `cacheComponents`; `node:sqlite` instead of Prisma (no native build on Windows) |
| 1 Design system & shell | ✅ | Mascot, kid components, PIN gate, en-US speech, sound effects |
| 2 Data model & schemas | ✅ | Zod schemas for all 10 types + packs; demo book (original content) |
| 3 Claude CLI bridge | ✅ | Uses the Claude Code bundled with the VS Code extension (auto-detected, v2.1.330); flags verified with `--help`; real call OK |
| 4 Book import pipeline | ✅ | Real *Tiếng Anh 1 Global Success* PDF: 77 pages rendered in 26 s; real Claude read pages 7–8 correctly (ball, book, bike, Bill; “B, b, a ___.”) |
| 5 Practice packs & viewers | ✅ | Claude generation + offline **Quick pack**; all players; presentation mode |
| 6 Quizzes, games, print | ✅ (partial) | 6 question kinds, 11 animated games (two picked per unit/topic), A4 printing with answer keys. Missing: cross-unit **test builder** (`/parent/tests`) |
| 7 Child mode & progress | ✅ | My World, stickers, daily goal, break hint, weekly chart, weak words |
| 8 AI Studio | ✅ | Streaming chat, child-level context, save pack as draft topic |
| 9 Polish & verification | ⏳ | Done: typecheck, lint, 104 unit tests, production build, real-Claude runs, Playwright e2e in Edge (16 flows), form item editor, AI Studio attachments. To do: tablet/TV check |

### Update 2026-11-21 (family feedback)
- ✅ Adding a book now makes the **full learning-resource set for every unit** automatically (Claude + offline builder), live right away; per-book and per-unit "remake" buttons.
- ✅ Each child can learn **one or more books** (`bookIds`); book tabs in the child's world.
- ✅ **Natural, expressive voice** (Kokoro neural TTS, 6 American voices, default *Heart*), pre-generated and cached; browser voice as fallback.

### Update 2026-11-21 (lesson rules, book pictures, editing, child UI)
- ✅ **Lesson rules** page (`/parent/rules`): 4 editable built-in rules (book words only · book pictures · reading = book text · clear for kids) + the parent's own rules; enforced in code, not only in the prompt.
- ✅ **Book pictures**: extraction returns a picture box per word (real Claude on a drawn test page: IoU 0.98–1.00); pictures are cut from the page and replace the emoji everywhere; parent can re-pick them on the unit page.
- ✅ **Reading = the book's own text** (extraction keeps `sentences` + `readings`; examples/listening/speaking use the book's sentences).
- ✅ **Form editor** for every lesson type (schema-driven), live preview, JSON as an advanced option.
- ✅ **Child UI**: winding adventure path with book pictures, progress rings, "next" glow + clover guide; unit playground grouped Learn → Practice → Play → Check with "Start here!"; pop-in/page animations; instant screen changes (cached data).
- ✅ Quick pack no longer fills two-gap patterns with one word.

### Update 2026-11-21 (AI Studio files)
- ✅ **Attach files in AI Studio**: pictures, PDF, Word, Excel, PowerPoint (+ CSV/text) via 📎, drag & drop or paste; read in a separate process (own ZIP/OOXML reader, pdfjs, canvas) into text + pictures; Claude reads the text and opens the pictures with Read inside the chat's folder. Checked on real Office-made files and one real Claude run (opened both pictures, used the file's words and Vietnamese meanings).

### Update 2026-11-21 (try again, reading pauses, topics per child)
- ✅ **Wrong answer → try again**: the wrong pick is marked (❌, red, locked) with "Oops! That's not right. Try again!" (shown + spoken); Next only after the right answer; the right answer glows after 2 misses; stars count first tries. All quiz kinds, tests, listening, grammar/reading practice, balloon, spelling, sort.
- ✅ **Reading pauses**: the voice reads sentence by sentence / line by line with natural pauses (longer between paragraphs, longer at slow speed); dialogue labels aren't read; blanks are a short pause; long passages are no longer cut at the model's limit. Checked with real Kokoro on the family's book passage (line ≈ 0.7 s, sentence ≈ 0.55 s, paragraph ≈ 1.1 s).
- ✅ **AI Studio topics per child**: given in Children → Edit → Extra topics; only those children see the Bonus island. Existing children kept the topics that were live.

### Update 2026-11-22 (hear myself, topic pictures, sticker album, faster voice)
- ✅ **Speaking: hear myself** — the mic is recorded while the child speaks (memory only, dropped on Next / leaving).
- ✅ **Pictures for AI Studio topics** — Claude plans each word, searches openly licensed pictures (Openverse), looks at numbered contact sheets and picks one, or draws an SVG; credits kept; the parent can change each picture; setting web / drawings only / emoji only. Real run: 5 words in 49 s (crab, whale, octopus from the web — Claude skipped a cooked-octopus and a tattoo picture; "swim" drawn; "hello" emoji).
- ✅ **Sticker album** — 14 themed pages × 8 stickers (original robot drawings), a trophy per full page = level; old stickers moved into the album.
- ✅ **Faster voice** — fp32 Kokoro (measured 3× faster), priority queue (a tap: 0.7 s with 10 sentences queued, before: behind all of them), passages played sentence by sentence, ⏳ while waiting, background warm-up of all lessons (also after a speed/voice change).

### Update 2026-11-22 (Gemini removed)
- ↩️ **Gemini was tried in AI Studio and removed again** at the family's request (with their free-plan key the useful models were overloaded or not included, and pictures were not available). AI Studio, topics and all topic pictures (web search + Claude's choice, or Claude's drawings) are Claude only; no Gemini settings or key.

### Update 2026-11-22 (project name, pictures in the parent's style, 11 animated games)
- ✅ **Project name** `01_Dashboard_English` (docs, `package.json`); the start file rebuilds by itself when the folder is moved or renamed.
- ✅ **Claude generates the topic pictures** (new default) in the style of the pictures attached in the chat (copied as the topic's style pictures; add/remove on the topic page), or in a style it picks for the topic; Claude checks its drawings and redraws weak ones. Real runs: a pixel-art reference → cow, pig, duck, horse drawn as matching pixel art; no reference → a consistent cute set, one picture improved after the check (102 s for 5).
- ✅ **11 mini games** (new: Go fishing, Feed Munchy, I spy, Pop-up friends, Copy the parrot, Go car go!, Rocket words), all with animated scenes and original characters; the 4 old games got animations too (3D flip cards, popping balloons, letters dropping in, flying cards).
- ✅ **Two games per unit/topic**, picked for the topic and different from the units just before; the family's 24 units are updated once, on the first start, from the same three games to two fitting ones each (edited games kept; stars kept; checked on a copy of the family's database: 10 kinds used, no unit repeats the one before).

### Next steps
1. Import the real book (Parent → Books) and check the book pictures/reading texts on a few unit pages.
2. Build the cross-unit test builder (`/parent/tests`).
3. Tablet/TV layout check; extend Playwright (printing, picture picker drag).

---

## Phase 0 — Scaffold

```
Read CLAUDE.md and docs/PROJECT_SPEC.md fully.
Scaffold the app in this folder: Next.js (App Router, TypeScript strict, Tailwind, ESLint, src/ dir),
Prisma + SQLite (data/app.db), Zod, zod-to-json-schema, Framer Motion, pdfjs-dist, @napi-rs/canvas, Vitest, Playwright, tsx.
If create-next-app refuses because the folder isn't empty, scaffold in a temp folder and move the files in,
keeping CLAUDE.md, README.md, docs/, resources/, .env.example and merging .gitignore.
Add npm scripts: dev (bind 127.0.0.1), build, test, e2e, db:seed, book:scan, book:import.
Update the Commands section of CLAUDE.md. Finish with npm run build passing.
```

## Phase 1 — Design system & app shell

```
Implement PROJECT_SPEC §7: colour tokens, Baloo 2 + Nunito, per-content-type colour/icon map, kid components
in src/components/kids/ (BigButton, FlashCard, StarBurst, CloverMascot — an original smiling four-leaf clover SVG, ProgressDots, SoundToggle).
Build the Child shell (full screen, big buttons, avatar picker) and the Parent shell (sidebar: Home, Books,
Inspiration, AI Studio, Tests, Children, Settings) with the PIN gate (§5.1).
Implement src/lib/speech.ts: en-US voice selection order, rates, "slow" mode, en-US speech recognition with lenient matching.
Add a /dev/components page showing every component and a voice test button.
```

## Phase 2 — Data model & schemas

```
Implement the Prisma schema (§8), the ContentItem envelope (§4) and Zod schemas for: BookMeta, UnitExtract (§2.2),
BookAssessment (§3.2), PracticePack, InspirationPack and all 10 content types, each with valid/invalid test fixtures.
Write db:seed that loads content/books/** into SQLite. Add one small DEMO book fixture (tests/fixtures, original content)
so the app is usable before real books are imported; mark it clearly as demo.
```

## Phase 3 — Claude CLI bridge

```
Implement PROJECT_SPEC §6.1.
1. Run `claude --help` and `claude --version` first; adapt flags to the installed CLI and note them in CLAUDE.md.
2. src/server/claude/bridge.ts: spawn with shell:true, prompt via stdin, stream-json output, --resume, per-job tool
   restrictions, --add-dir for the book cache, timeout, cancel (kill process tree on Windows), concurrency 1.
3. parser.ts: stream-json → text deltas, session_id, final result; extract fenced JSON blocks; validate with Zod.
4. GET /api/claude/status. Tests with a fake CLI script (tests/fixtures/fake-claude.*) — no real login needed.
If `claude` is not on PATH, show it clearly in Settings with setup steps; don't block other work.
```

## Phase 4 — Book import pipeline

```
Implement PROJECT_SPEC §2.1 and §3 in src/server/books/ + scripts/:
scan (hash, skip unchanged) → render pages to PNG with pdfjs-dist + @napi-rs/canvas (+ thumbnails) → overview
(cover/contents → BookMeta + unit page ranges) → per-unit extraction in batches of ≤ 8 pages → assessment → validation.
Resumable steps, --force, progress logs. Prompt file src/server/claude/prompts/book-extract.md.
UI: /parent/books (cards, status, "Import new books" with SSE progress) and /parent/books/[bookId]
(assessment with reasons, unit list, page viewer). Unit review: edit words/patterns, low-confidence highlighting, Approve.
Test the whole pipeline with a generated sample PDF + fake CLI.
Then run it on the real PDFs in resources/book/ and report what was found (books, units, assessed age/stage).
```

## Phase 5 — Practice pack generation & viewers

```
Implement §6.2: practice-pack.md prompt using the UnitExtract, earlier units' language, the book's generationProfile
and the child's age. "Generate practice pack" in the Unit workspace, saved as draft, review/approve, regenerate item,
make easier/harder.
Build Viewer + Editor for Vocabulary, Grammar, Reading, Listening, Speaking (en-US TTS/recognition) and /present/[itemId].
Hide types that don't fit the stage (e.g. Reading for pre-readers).
```

## Phase 6 — Quizzes, games, worksheets, tests

```
Quiz engine (multiple choice, picture choice, true/false, matching, fill-in, drag & drop) with feedback, sounds, stars and tests.
Game engines fed by unit words: Memory match, Balloon pop, Spelling bee, Sort into baskets, Word bingo (printable), Spin the wheel.
Print renderers (A4, answer key toggle) for Worksheets, Home lesson plans and Tests. /parent/tests builder from the question bank.
```

## Phase 7 — Child mode, progress & family features

```
Child flow (§5.3): avatar → My World map for the active book (approved items only, Bonus islands for inspiration topics)
→ unit playground → activity player → stickers. Record Attempts and Stickers.
/parent/children: profiles with age + active book, fit indicator from the assessment (§3.3), weak words, weekly summary.
Daily goal and break reminder from Settings.
```

## Phase 8 — AI Studio (inspiration topics)

```
Implement §6.3: /parent/studio with threads, streaming chat, quick prompts, "Match my child's book level" context,
inspiration-pack preview with real viewers, Save as draft, Ask Claude to fix. /parent/inspiration list/edit/approve.
Never write inspiration content into book data.
```

## Phase 9 — Polish & verification

```
Go through PROJECT_SPEC §10: Playwright smoke tests (child, parent, studio with fake CLI), accessibility pass,
tablet and TV layouts, Settings (voice test, Claude status, backup export/import). Fix issues and summarise what's done and what's left.
```

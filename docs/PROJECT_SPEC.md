# Emma English Studio — Project Specification

> Project folder: `01_Dashboard_English` · Version 2.0 · 2026-11-21
> A family English dashboard: a parent teaches and gives extra practice to their own children at home.

---

## 1. Overview

| Item | Decision |
|---|---|
| Who uses it | **Parent** (prepares, reviews, prints, follows progress) and **Child** (learns, plays, earns rewards). One family, one or more children |
| Learners | Children about 3–10, mainly 3–8 |
| Content source | The family's own English textbooks, dropped as **image-based PDFs** in `resources/book/` |
| Level / age | **Assessed from each book's content** (§3), not hard-coded |
| Voice | **American English (en-US)** |
| Interface | English; optional Vietnamese meanings for words in parent mode |
| Runs on | The family's Windows PC, in Chrome or Edge, on a laptop, tablet browser or TV screen |
| AI | Local **Claude Code CLI**, called by the app's server: (1) read the book pages, (2) generate practice from them, (3) chat to create extra inspiration topics |

### Goals
1. Parent drops a book PDF in → the app finds its units, words and sentence patterns, and estimates which age/level it suits.
2. For each unit, the parent can generate and review a **practice pack**: vocabulary, grammar, reading, listening, speaking, worksheets, quizzes, games, a short home lesson plan and a test.
3. Child gets a bright, simple, motivating space to practise what they're learning at school.
4. Parent can chat with Claude to create extra **inspiration topics** (e.g. "Dinosaurs", "Our trip to Da Lat"), kept separate from book content.

### Non-goals (v1)
- No cloud, accounts or sync; no sharing of book content outside the family's PC.
- No AI access for children.

---

## 2. Book source: `resources/book/`

- The parent puts PDF files here (subfolders allowed). They are scanned images, so text must be read visually by Claude (vision), not by PDF text extraction.
- Suggested name: `<grade>_<series>_<bookType>.pdf`, e.g. `G3_GlobalSuccess_StudentBook.pdf`, `G3_GlobalSuccess_Workbook.pdf`. The name is only a hint; the importer confirms by reading the pages.
- Student book and workbook of the same series/grade are linked into one **book set**.
- All PDFs and generated caches are **gitignored**.

### 2.1 Import pipeline (`npm run book:import`, also a button in Parent → Books)

```
resources/book/*.pdf
  │ 1. Scan     → bookId = slug(file name) + SHA-256 of file (skip unchanged files)
  │ 2. Render   → pdfjs-dist + @napi-rs/canvas → resources/.cache/<bookId>/pages/p-001.png (+ small thumbnails)
  │ 3. Overview → Claude CLI reads cover + contents pages → BookMeta (title, series, grade, unit list + page ranges)
  │ 4. Units    → Claude CLI reads each unit's pages (batches of ≤ 8 pages) → UnitExtract JSON
  │ 5. Assess   → level & age assessment (§3) from all UnitExtracts
  │ 6. Validate → Zod; problems listed for the parent
  ▼
content/books/<bookId>/book.json, units/<unitId>.json   (gitignored, editable)
  │ 7. Review   → Parent → Books → fix words, approve unit
  ▼
SQLite (npm run db:seed or automatic after approval)
```

- Resumable: every step writes its own output; a re-run skips completed steps unless `--force`.
- Claude is run with **read-only access** to the cache folder (e.g. only the `Read` tool, `--add-dir` limited to `resources/.cache/<bookId>`); no edits, no shell.
- Progress shown in the UI (step, unit x/y, errors) and in the terminal.

### 2.2 UnitExtract (Zod)

```ts
UnitExtract = {
  id: string;                    // "<bookId>-u03"
  bookId: string;
  order: number;
  title: string;                 // as printed in the book
  pages: [number, number];
  topic: string;                 // e.g. "family members"
  vocabulary: { word: string; partOfSpeech?: string; emoji?: string; vi?: string; page: number;
                pic?: { page: number; box: [left, top, width, height] } }[];   // the book's own picture (fractions of the page)
  patterns: { text: string; function: string; page: number }[];   // "What's this? It's a ___."
  sentences: string[];           // model sentences exactly as printed (bubbles, dialogues, pattern boxes)
  readings: { title: string; text: string; page?: number }[];     // reading/chant/dialogue texts exactly as printed
  phonics?: { focus: string; examples: string[] }[];
  songsChants?: { title: string; page: number }[];
  skills: ("listening" | "speaking" | "reading" | "writing")[];
  activityTypes: string[];       // e.g. "point and say", "listen and tick", "read and match"
  notes?: string;                // anything the parent should know
  confidence: number;            // 0–1; low → highlighted for review
};
```

---

## 3. Level & age assessment

Done per book (and refined per unit) in import step 5, so the app knows **which age the content suits** and can match it to each child.

### 3.1 Signals
| Signal | Example of measurement |
|---|---|
| Stated grade / series level | Cover, contents page, file name hint |
| Vocabulary load | New words per unit, total distinct words, word length |
| Sentence complexity | Average words per pattern, question forms, tenses present |
| Skills demanded | Listening/speaking only → younger; reading passages and writing tasks → older |
| Reading text length | Longest passage in words |
| Literacy prerequisites | Tracing letters / phonics → early stage; paragraph writing → upper primary |

### 3.2 Output (`BookAssessment`)
```ts
{
  stage: "pre-reader" | "early-reader" | "developing-reader" | "independent-reader";
  cefr: "Pre-A1" | "A1" | "A2";
  estimatedAge: { min: number; max: number };     // e.g. { min: 6, max: 7 }
  estimatedGrade?: 1 | 2 | 3 | 4 | 5;
  rationale: string[];                            // short, human-readable reasons
  generationProfile: {                            // used for every content generation from this book
    maxSentenceWords: number;
    readingPassageWords: [number, number];
    allowWriting: boolean;
    allowReadingInstructions: boolean;            // false → instructions are audio + icons only
    questionsPerQuiz: number;
    sessionMinutes: number;
  };
}
```

Default stage mapping (Claude may adjust with rationale):

| Stage | Typical age | Typical books | Generation style |
|---|---|---|---|
| pre-reader | 3–5 | Pre-school / starter | Pictures, audio, songs; no reading or writing; 5–6 items per activity |
| early-reader | 6–7 | Grade 1–2 | Short words, 3–6 word sentences, tracing and copying, picture-supported reading |
| developing-reader | 8–9 | Grade 3–4 | Short passages 40–80 words, simple writing, 8–10 quiz questions |
| independent-reader | 9–10 | Grade 5 | Passages 80–150 words, sentence writing, mixed tests |

### 3.3 Use in the app
- Each child profile has an **age** and an **active book**. The Parent home shows a fit indicator: ✅ suitable / ⚠️ challenging / 💤 easy, with the reason.
- Each generated item stores the `generationProfile` it was built with.
- Child performance (scores per unit) can suggest moving faster or slower.

---

## 4. Content types (practice pack per unit)

Each type has: a **Zod schema**, a **Viewer** (screen/TV), an **Editor** (parent) and, where relevant, a **Print** renderer (A4).
All content uses only the unit's vocabulary/patterns plus earlier units of the same book (spiral review), within the book's `generationProfile`.

| # | Type | Child experience | Key behaviour |
|---|---|---|---|
| 1 | **Vocabulary** | Flashcards with big picture/emoji, word, example | Tap to flip, 🔊 en-US TTS, slideshow mode |
| 2 | **Grammar** | One pattern from the book, colour-coded, 3–5 examples | Drag words into the pattern; no grammar jargon for younger stages |
| 3 | **Reading** | The unit's own reading text from the book (word for word, line breaks kept) + easy questions; a new passage only if the parent turns the "book reading" rule off | Read-aloud with word highlighting; tap a word to hear it. The voice reads sentence by sentence / line by line with natural pauses (longer between paragraphs); dialogue labels ("A:", "Mai:") are not read; blanks "____" become a short pause (`src/lib/speechPlan.ts`) |
| 4 | **Listening** | TTS-played script; tick the picture, number the order, true/false | Play / slow / repeat; script hidden until parent taps "Show" |
| 5 | **Speaking** | Repeat after me, picture prompts, simple Q&A from the book's patterns | Speech recognition (en-US) gives stars; the child's voice is recorded at the same time → 👂 **Hear myself** (memory only, dropped on Next / leaving); without recognition: record & play back |
| 6 | **Worksheets** | Printable A4: trace, match, circle, colour-by-word, fill-in, word search | Print CSS / Save as PDF; answer key page |
| 7 | **Quizzes** | Multiple choice, picture choice, true/false, matching, fill-in, drag & drop | Instant feedback, sounds, stars, random order. **A wrong answer must be fixed**: it is shown as wrong (❌, red, "Oops! That's not right. Try again!" + voice) and locked; "Next" appears only after the right answer; after 2 misses the right answer glows. Stars count first-try answers. Same in listening, tests, grammar/reading practice and every mini game |
| 8 | **Home lesson plan** | For the parent: 15–30 min session: Warm-up → Learn → Practise → Play → Review | Step-by-step script the parent can follow, links to the unit's items |
| 9 | **Mini games** | 11 games, each with its own animated scene and original characters: Go fishing (catch the swimming fish with the heard word), Feed Munchy (give the hungry monster what it asks for — tap or drag), I spy (see a part through a magnifier), Pop-up friends (tap the right one when it pops up), Copy the parrot (tap the heard words in order), Go, car, go! (yes/no → the car races to the flag), Rocket words (readers: pick the written word → blast off), Memory match (3D flip cards), Balloon pop, Spelling bee (writers), Sort into baskets (needs categories) | Reusable engines fed by any unit's words. **Two games per unit/topic**, chosen by topic theme, avoiding the units just before and mixing two ways of playing (`src/lib/games.ts`); the parent can switch a game's kind. Celebrations: bursts, chomps, splashes, blast-off; motion stops with `prefers-reduced-motion` |
| 10 | **Tests** | Unit test / mid-term / end-of-book review, sections by skill | On-screen auto-scoring or printable with answer key |

### Content item envelope
```ts
ContentItem = {
  id: string;
  source: "book" | "inspiration";
  bookId?: string; unitId?: string;          // book items
  inspirationTopicId?: string;               // inspiration items
  type: "vocabulary" | "grammar" | "reading" | "listening" | "speaking"
      | "worksheet" | "quiz" | "lessonPlan" | "game" | "test";
  title: string;
  status: "draft" | "approved";
  stage: Stage;                              // from the book assessment
  data: unknown;                             // per-type Zod schema
  createdBy: "claude" | "parent";
  createdAt: string; updatedAt: string;
};
```

---

## 5. Roles and screens

### 5.1 Roles
- **Child mode** (default on launch): choose your avatar → see approved items for your active book.
- **Parent mode**: local 4-digit PIN (stored hashed), a simple child lock, not real security.

### 5.2 Parent screens
| Route | Screen | Content |
|---|---|---|
| `/parent` | **Home** | Per child: active book & unit, fit indicator, this week's minutes/stars, suggested next unit, quick actions |
| `/parent/books` | **Books** | Book cards (cover thumbnail, series, assessed age/stage), import status, "Import new books" |
| `/parent/books/[bookId]` | Book detail | Assessment with reasons, unit list, page viewer (rendered pages for the family's own reference) |
| `/parent/books/[bookId]/[unitId]` | **Unit workspace** | Extracted words/patterns (editable), "Generate practice pack", tabs for the 10 content types, review & approve, print, "Show on TV" |
| `/parent/inspiration` | **Inspiration topics** | Topics made with Claude, purple "✨ Inspiration" badge |
| `/parent/studio` | **AI Studio** | Chat with Claude (§6) |
| `/parent/tests` | Test builder | Pick units → questions → sections → print / assign |
| `/parent/children` | Children & progress | Profiles (name, avatar, age, books, **extra topics from AI Studio**), stars, weak words, weekly report |
| `/parent/settings` | Settings | PIN, en-US voice & speed, daily goal & break reminder, sounds, Claude CLI status & path, backup export/import |
| `/present/[itemId]` | Presentation | Full screen for TV/laptop, keyboard navigation |

### 5.3 Child screens
| Route | Screen | Content |
|---|---|---|
| `/` | **Who's learning?** | Big avatar buttons |
| `/learn` | **My World** | Map with one island per unit of the active book; stars earned; "Bonus islands" for the approved inspiration topics given to this child (Children → Edit); mascot greeting |
| `/learn/[unitId]` | Unit playground | Big icon buttons: Words 🃏, Listen 🎧, Speak 🎤, Read 📖, Play 🎮, Quiz ⭐ (only what fits the stage) |
| `/learn/play/[itemId]` | Activity player | One activity full screen, progress bar, celebration |
| `/learn/stickers` | Sticker book | Album of 14 themed pages × 8 stickers (land animals, sea, bugs, vehicles, robots, boats, space, farm, birds, fruit, treats, music, sports, weather); 1 sticker per 5 ⭐ in album order; a full page wins its trophy (bronze → silver → gold); trophies = the child's level; tap a sticker to hear its name |

Family-friendly extras: daily goal (default 15 min), gentle "time for a break" after the set time, weekly summary for the parent.

---

## 6. Claude CLI integration

### 6.1 Bridge
```
Browser ── POST /api/claude/* (SSE) ──► Next.js server route
                                         └─► ClaudeBridge (src/server/claude/bridge.ts)
                                              spawn(CLAUDE_CLI_PATH, args, { shell: true }), prompt via stdin
                                              ◄── stream-json events on stdout → parser → SSE → UI
```
- Server-only, app bound to `127.0.0.1`.
- Expected CLI usage (confirm with `claude --help` of the installed version): `-p` print mode; `--output-format stream-json --verbose` (fallback `json`); `--resume <session_id>`; `--append-system-prompt`; `--model` (optional); tool restriction (`--allowedTools` / `--disallowedTools`), `--add-dir` for the book cache, small `--max-turns`.
- Three jobs, each with its own prompt file in `src/server/claude/prompts/`:
  | Job | Tools allowed | Output |
  |---|---|---|
  | `book-extract.md` | Read (book cache only) | `BookMeta`, `UnitExtract`, `BookAssessment` JSON |
  | `practice-pack.md` | none | `PracticePack` JSON for one unit |
  | `studio.md` | none; Read inside the chat's own folder when the chat has attached files | chat text, optional `inspiration-pack` JSON block |
  | `picture-style.md` | Read (the topic's folder) when there are style pictures | the topic's drawing style (`PictureStyle`): summary, palette, outline, fill, shapes, background, details |
  | `picture-draw.md` | none | SVG per word in that style (shapes + soft filters only, rasterized by the app) |
  | `picture-review.md` | Read (the topic's folder) | per drawing on a numbered sheet: ok, or a fix → drawn again once |
  | `picture-plan.md` | none | ("web" mode) per topic word: web (search words) · draw · emoji |
  | `picture-pick.md` | Read (the topic's picture folder only) | ("web" mode) picture number per word from the numbered contact sheets, 0 = none good |
- Timeout (default 180 s per call, longer for extraction), cancel kills the process tree, concurrency 1 (the picture job, in its own process, draws up to 3 batches at once).
- `GET /api/claude/status` runs `claude --version` → 🟢 / 🔴 with setup steps. Without the CLI, everything already imported/generated keeps working.
- JSON Schemas for prompts are generated from the Zod schemas (`zod-to-json-schema`) so prompts and validators never drift.

### 6.2 Practice pack generation (book-focused)
Input to Claude: the UnitExtract, the words/patterns of earlier units (for review), the book's `generationProfile`, the child's age, and the requested types.
Rules in `practice-pack.md`: the family's **lesson rules** (`/parent/rules`, see CLAUDE.md 4c) come first — by default: only the unit's words/sentences (plus earlier units), the book's own pictures (emoji in the JSON are swapped for the book picture of the same word), reading = the book's text, clear and easy for the child. Also child-safe, inclusive, everyday family/school contexts; US spelling. Rule violations found in Claude's output are dropped in code and rebuilt offline from the book.
Output `PracticePack = { unitId, items: ContentItem.data[] by type }` → validate → saved as **draft** → parent reviews in Unit workspace → **approve**.
"Regenerate this item" and "Make it easier / harder" buttons send a focused follow-up.

### 6.3 AI Studio (inspiration topics)
- Thread list, streaming chat, quick prompts ("✨ New topic about…", "🎮 Game with these words…", "📄 Worksheet for my 6-year-old…").
- Optional context: "Match my child's book level" (attaches the active book's assessment + known words) so free topics still fit the child.
- When creating, Claude adds one ` ```inspiration-pack ` JSON block → preview with real viewers → **Save as draft to Inspiration topics**; on validation errors, "Ask Claude to fix".
- Saved with `source = "inspiration"`; never written into a book.
- **Pictures (Claude generates them)**: saving a topic copies the chat's attached pictures as the topic's **style pictures** (`data/topics/<topic>/style/`, ≤ 4) and starts a background job (`scripts/topic-pictures.ts`): Claude looks at the style pictures and writes the style down (only the look — never characters, logos or text); without style pictures it picks a style that fits the topic → Claude draws every word in that style as SVG → PNG (a few words per call, up to 3 calls at once) → Claude checks a numbered sheet of its drawings and redraws the ones a young child wouldn't recognize or that don't match the style. Greetings and words that can't be drawn keep their emoji. The topic page shows the style pictures and the style; the parent can add/remove style pictures, "Draw all again", redraw one word, or go back to the emoji. Setting: **Claude draws (default)** · web pictures + drawings (openly licensed **Openverse** pictures picked by Claude from numbered sheets, only the search words are sent; credits shown) · emoji only. Real runs: 4 farm animals in the style of a pixel-art picture (pixel art, same outline/palette/background); without a style picture Claude chose a cute rounded style for the whole set (5 pictures, 1 redrawn after its check, 102 s).
- **Games**: every topic gets two mini games that fit it (Claude picks them, told which games the newest topics used; when a pack has fewer than two, the app adds ones that fit).
- **Given per child**: a topic reaches a child only when the parent ticks it in **Children → Edit → Extra topics** (`children.topic_ids`) and it is approved. The topic page shows who has it. (On upgrade, existing children kept the topics that were live for them.)
- **Attached files** (📎 button, drag & drop, paste): pictures (PNG/JPG/GIF/WebP/BMP/AVIF), PDF, Word `.docx`, Excel `.xlsx`/`.csv`, PowerPoint `.pptx`, text — up to 8 files of 30 MB per message. Each upload is read in its own process (`scripts/studio-file.ts` → `src/server/files/`) into `data/studio/<threadId>/<fileId>/`: `text.md` (paragraphs, headings, lists, tables, slides + notes, sheets; PDF text per page), `img-NN.jpg` (the picture; PDF pages that have pictures or almost no text, max 10; pictures inside Word/PowerPoint/Excel, max 10; ≤ 1568 px), `thumb.jpg`, `info.json`.
  - The message's files are sent to Claude as their text (≤ 12 000 characters per file, 30 000 per message; the rest stays in `text.md`) plus the absolute paths of the pictures, which Claude opens with the Read tool. The chat's Claude always runs in the thread folder (so `--resume` finds the session) and gets the Read tool only when the chat has files.
  - Old binary `.doc/.xls/.ppt`, iPhone HEIC photos, password-protected or damaged files get a plain explanation of what to do instead.
  - Files stay on this PC (like the books); deleting the chat deletes them.

---

## 7. Visual design

Bright, sunny, playful, uncluttered: a picture book, not a spreadsheet.

| Token | Value | Use |
|---|---|---|
| `--sun` | `#FFC83D` | Primary, mascot, stars |
| `--sky` | `#4FC3F7` | Listening |
| `--grass` | `#66BB6A` | Correct, Reading |
| `--berry` | `#FF6B9A` | Speaking |
| `--grape` | `#9C6ADE` | Inspiration / AI content |
| `--orange` | `#FF8A3D` | Games, main actions |
| `--cream` | `#FFF9EC` | Page background |
| `--ink` | `#2B2D42` | Text (WCAG AA on every background) |

- Fixed colour + icon per content type, used everywhere.
- Fonts: **Baloo 2** (headings) + **Nunito** (body) via `next/font/google`.
- Radius 20–28px, soft shadows, chunky buttons; mascot: a smiling four-leaf clover 🍀 (original SVG, `CloverMascot`).
- Feedback: star bursts and confetti; gentle "Oops! That's not right. Try again!" (said and shown, with the wrong pick marked — never just a red X); the child picks again until right; sounds can be switched off.
- Parent screens: same palette, denser layout, sidebar navigation.
- Responsive: laptop, tablet, TV 16:9. `prefers-reduced-motion` respected; visible focus rings.

### Voice (en-US)
- TTS voice preference order: Edge "Microsoft Ava/Jenny/Aria (Natural) – English (United States)", Chrome "Google US English", then any `en-US` voice. Selectable in Settings with a test button.
- Default rate 0.85 for children, 1.0 for parent; "slow" button = 0.65.
- Speech recognition `lang = "en-US"`, lenient matching for young children (accept close matches).

---

## 8. Data model (SQLite)

> Implemented with Node's built-in `node:sqlite` (`src/server/db.ts`) instead of Prisma, so no native module has to be compiled on Windows. Table names are snake_case versions of the entities below.

```
Book(id, fileName, fileHash, title, series, bookType, grade?, pageCount, coverPath, status, assessment Json, importedAt)
BookSet(id, title, series, grade)               // links student book + workbook
Unit(id, bookId, order, title, topic, pages Json, extract Json, status: "needs-review" | "approved")
InspirationTopic(id, title, emoji, description, stage, status, createdAt)
ContentItem(id, source, bookId?, unitId?, inspirationTopicId?, type, title, status, stage, data Json, createdBy, createdAt, updatedAt)
Question(id, contentItemId?, unitId?, skill, format, data Json)          // bank for quizzes/tests
Test(id, title, scope Json, sections Json, status, createdAt)
Child(id, name, avatar, age, activeBookId?, dailyGoalMinutes, createdAt)
Attempt(id, childId, contentItemId, score, maxScore, stars, durationSec, details Json, createdAt)
Sticker(id, childId, code, earnedAt)
ImportJob(id, bookId, step, progress, log Json, startedAt, finishedAt?)
ChatThread(id, title, claudeSessionId, createdAt) / ChatMessage(id, threadId, role, text, packJson?, createdAt)
Setting(key, value)
```

Backup: Settings → "Export" downloads one JSON with all data (no PDFs); "Import" restores it.

---

## 9. Project structure

```
01_Dashboard_English/
├─ CLAUDE.md
├─ README.md
├─ .env.example
├─ docs/                         PROJECT_SPEC.md, BUILD_PROMPTS.md
├─ resources/
│  ├─ book/                      ← family puts textbook PDFs here (gitignored)
│  └─ .cache/                    rendered pages (gitignored)
├─ content/books/<bookId>/       extracted JSON (gitignored)
├─ data/app.db                   SQLite (gitignored)
├─ prisma/schema.prisma
├─ scripts/book-scan.ts, book-import.ts, seed.ts
├─ src/app/(child)/…             child routes
├─ src/app/parent/…              parent routes
├─ src/app/present/[itemId]
├─ src/app/api/claude/…          status, chat, generate
├─ src/app/api/books/…           scan, import (SSE progress)
├─ src/components/ui/  src/components/kids/
├─ src/features/<type>/          schema.ts, Viewer.tsx, Editor.tsx, Print.tsx
├─ src/features/games/<game>/
├─ src/lib/speech.ts             en-US TTS + recognition
├─ src/server/books/             scan, render, extract, assess
├─ src/server/claude/            bridge.ts, parser.ts, prompts/*.md
├─ src/i18n/en.ts
└─ tests/  (fixtures: a small sample PDF made by the tests themselves, fake CLI script)
```

---

## 10. Quality bar
- `npm run build` passes; TypeScript strict; ESLint clean.
- Unit tests: all Zod schemas (valid + invalid fixtures), stream-json parser, assessment rules, quiz scoring, test builder.
- Book pipeline and Claude bridge tested with a **fake CLI** script and a generated sample PDF, so tests never need a real login or real books.
- Playwright smoke: child flow (avatar → unit → quiz → stars), parent flow (PIN → books → unit → approve → print preview), Studio with fake CLI.
- Lighthouse accessibility ≥ 90 on child pages.

---

## 11. Prerequisites
1. Node.js 20+ — ✅ installed (v26).
2. **Claude Code CLI** in PATH and logged in (`claude --version` works in a new terminal). If only the VS Code extension is installed, install the CLI or set `CLAUDE_CLI_PATH`.
3. Chrome or Edge (en-US voices + speech recognition).
4. At least one textbook PDF in `resources/book/` before the import phase.

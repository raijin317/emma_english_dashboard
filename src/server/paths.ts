import path from "node:path";

/** All paths are relative to the project root (where npm / next run). */
export const ROOT = process.cwd();
// Runtime-only data folders: tell Turbopack not to trace them into the build.
const fromEnv = (key: string, fallback: string) => path.resolve(/*turbopackIgnore: true*/ ROOT, process.env[key] || fallback);

export const paths = {
  root: ROOT,
  dbFile: fromEnv("APP_DB_FILE", "data/app.db"),
  booksDir: fromEnv("BOOKS_DIR", "resources/book"),
  cacheDir: fromEnv("BOOK_CACHE_DIR", "resources/.cache"),
  contentDir: fromEnv("BOOK_CONTENT_DIR", "content/books"),
  /** Files attached in AI Studio: <threadId>/<fileId>/ (private, like the books). */
  studioDir: fromEnv("STUDIO_DIR", "data/studio"),
  /** Pictures of AI Studio topics: <topicId>/<word-slug>/ (web candidates, Claude's drawing). */
  topicsDir: fromEnv("TOPICS_DIR", "data/topics"),
  promptsDir: path.resolve(ROOT, "src/server/claude/prompts"),
  tmpDir: path.resolve(ROOT, ".tmp"),
};

export const bookCacheDir = (bookId: string) => path.join(paths.cacheDir, bookId);
export const bookPagesDir = (bookId: string) => path.join(paths.cacheDir, bookId, "pages");
export const bookContentDir = (bookId: string) => path.join(paths.contentDir, bookId);
export const pageFile = (bookId: string, page: number) => path.join(bookPagesDir(bookId), `p-${String(page).padStart(3, "0")}.png`);
export const thumbFile = (bookId: string, page: number) => path.join(bookPagesDir(bookId), `t-${String(page).padStart(3, "0")}.png`);

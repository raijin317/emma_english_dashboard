/**
 * npm run book:import -- all            import every new/changed PDF and make its learning resources
 * npm run book:import -- <bookId|file>  one book
 * options:
 *   --force            redo everything (re-read pages, remake resources)
 *   --resources-only   skip reading; (re)make the learning resources of already-imported books
 *   --no-resources     only read the book
 *   --no-voice         don't pre-generate the natural voice
 *   --no-claude        make resources with the offline builder only
 *   --json             machine-readable progress lines (used by the app)
 */
import { scanBooks } from "../src/server/books/scan";
import { importBook } from "../src/server/books/importer";
import { generateBookResources } from "../src/server/books/resources";
import { getAppSettings, getBook, listBooks, listItems } from "../src/server/repo";
import { claudeStatus } from "../src/server/claude/bridge";

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const json = has("--json");
const force = has("--force");
const target = args.find((a) => !a.startsWith("--")) ?? "all";

const out = (type: string, payload: Record<string, unknown>) => {
  if (json) process.stdout.write(JSON.stringify({ type, ...payload }) + "\n");
  else if (type === "log") console.log(`${payload.progress !== undefined ? `[${String(payload.progress).padStart(3)}%] ` : ""}${payload.book ? `(${payload.book}) ` : ""}${payload.msg}`);
  else console.log(`${type}:`, payload.msg ?? payload);
};

async function makeResources(bookId: string, label: string) {
  const useClaude = !has("--no-claude") && (await claudeStatus()).ok;
  if (!useClaude) out("log", { book: label, msg: "Claude is not available — making resources with the offline builder." });
  const r = await generateBookResources(bookId, { force, useClaude, log: (msg, progress) => out("log", { book: label, msg, progress }) });
  out("log", { book: label, msg: `Learning resources ready for ${r.units} unit(s).`, progress: 100 });

  if (!has("--no-voice") && process.env.SUNNY_NO_VOICE !== "1") {
    const s = getAppSettings();
    if (s.ttsEngine === "natural") {
      out("log", { book: label, msg: "Preparing the natural voice (you can already use the book)…", progress: 0 });
      const { prepareAudio } = await import("../src/server/tts/prepare");
      const r2 = await prepareAudio(listItems({ bookId, status: "approved" }), s.ttsVoice, s.childRate, (done, total) =>
        out("log", { book: label, msg: `Voice ${done}/${total}`, progress: total ? Math.round((done / total) * 100) : 100 }),
      );
      out("log", { book: label, msg: `Voice ready (${r2.total} sentences).`, progress: 100 });
    }
  }
}

async function main() {
  let ok = 0;
  if (has("--resources-only")) {
    const books = target === "all" ? listBooks() : [getBook(target)].filter(Boolean);
    if (!books.length) return out("done", { msg: `No book matches "${target}".`, imported: 0 });
    for (const b of books) {
      out("log", { book: b!.title, msg: "Making learning resources…", progress: 0 });
      try {
        await makeResources(b!.id, b!.title);
        ok++;
      } catch (e) {
        out("error", { book: b!.title, msg: (e as Error).message });
      }
    }
    return out("done", { msg: `Resources made for ${ok}/${books.length} book(s).`, imported: ok });
  }

  const all = scanBooks();
  const chosen =
    target === "all"
      ? all.filter((b) => force || getBook(b.bookId)?.status !== "ready")
      : all.filter((b) => b.bookId === target || b.relPath === target || b.fileName === target);
  if (!chosen.length) return out("done", { msg: target === "all" ? "Nothing new to import." : `No book matches "${target}".`, imported: 0 });

  for (const b of chosen) {
    out("log", { book: b.fileName, msg: "Starting import", progress: 0 });
    try {
      await importBook(b, { force, log: (msg, progress) => out("log", { book: b.fileName, msg, progress }) });
      if (!has("--no-resources")) await makeResources(b.bookId, b.fileName);
      ok++;
    } catch (e) {
      out("error", { book: b.fileName, msg: (e as Error).message });
    }
  }
  out("done", { msg: `Imported ${ok}/${chosen.length} book(s).`, imported: ok });
}

main().catch((e) => {
  out("error", { msg: (e as Error).message });
  process.exit(1);
});

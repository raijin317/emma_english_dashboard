import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { route, ok, fail, localOnly } from "@/server/api";
import { paths } from "@/server/paths";
import { scanBooks } from "@/server/books/scan";

const MAX_MB = 500;

/** Saves an uploaded textbook PDF into resources/book/ (then the page starts the import). */
export const POST = route(localOnly(async (req) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail("Please choose a PDF file.");
  if (!/\.pdf$/i.test(file.name)) return fail("Only PDF files can be added.");
  if (file.size > MAX_MB * 1024 * 1024) return fail(`The file is too big (max ${MAX_MB} MB).`);

  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (String.fromCharCode(...head) !== "%PDF-") return fail("This file is not a real PDF.");

  fs.mkdirSync(paths.booksDir, { recursive: true });
  const base = path.basename(file.name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "book.pdf";
  let name = base;
  // (turbopackIgnore: runtime folders, so the build does not trace the whole project into its output.)
  for (let k = 2; fs.existsSync(path.join(/*turbopackIgnore: true*/ paths.booksDir, name)); k++) name = base.replace(/\.pdf$/i, ` (${k}).pdf`);
  const dest = path.join(/*turbopackIgnore: true*/ paths.booksDir, name);
  try {
    await pipeline(Readable.fromWeb(file.stream() as never), fs.createWriteStream(dest));
  } catch (e) {
    fs.rmSync(dest, { force: true });
    throw e;
  }
  const scanned = scanBooks().find((b) => path.resolve(/*turbopackIgnore: true*/ b.file) === path.resolve(/*turbopackIgnore: true*/ dest));
  // Same content already added under another name? Keep only one copy.
  const twin = scanBooks().find((b) => b.hash === scanned?.hash && path.resolve(/*turbopackIgnore: true*/ b.file) !== path.resolve(/*turbopackIgnore: true*/ dest));
  if (twin) {
    fs.rmSync(dest, { force: true });
    return ok({ fileName: twin.fileName, bookId: twin.bookId, duplicate: true });
  }
  return ok({ fileName: name, bookId: scanned?.bookId ?? null, duplicate: false });
}));

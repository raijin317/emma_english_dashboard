import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { paths } from "../paths";

export type ScannedBook = { file: string; relPath: string; fileName: string; bookId: string; hash: string; sizeMb: number };

export function slugify(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[đĐ]/g, "d")
      .toLowerCase()
      .replace(/\.pdf$/i, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "book"
  );
}

export function fileHash(file: string) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function walk(dir: string, out: string[] = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.pdf$/i.test(e.name)) out.push(p);
  }
  return out;
}

export function scanBooks(dir = paths.booksDir): ScannedBook[] {
  return walk(dir)
    .sort()
    .map((file) => {
      const hash = fileHash(file);
      const fileName = path.basename(file);
      return {
        file,
        relPath: path.relative(paths.root, file),
        fileName,
        bookId: `${slugify(fileName)}-${hash.slice(0, 8)}`,
        hash,
        sizeMb: Math.round((fs.statSync(file).size / 1048576) * 10) / 10,
      };
    });
}

/** Grade hint from names like "G3_...", "Grade 3", "lop 3", "PreK". */
export function gradeHintFromName(fileName: string): number | null {
  const n = slugify(fileName);
  if (/(^|-)(pre-?k|preschool|kindergarten|mau-giao|kg)(-|$)/.test(n)) return 0;
  const m = n.match(/(?:^|-)(?:g|grade|lop|class|tieng-anh|english)-?([1-5])(?:-|$)/);
  return m ? Number(m[1]) : null;
}

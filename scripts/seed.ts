/** npm run db:seed [-- --force]  — (re)loads the demo book and syncs extracted book JSON into SQLite. */
import fs from "node:fs";
import path from "node:path";
import { seedDemo } from "../src/server/demo";
import { paths } from "../src/server/paths";
import { BookMeta, UnitExtractCore, BookAssessment } from "../src/lib/schemas/book";
import { getBook, getUnit, upsertBook, upsertUnit } from "../src/server/repo";

const force = process.argv.includes("--force");
console.log(seedDemo(force) ? "Demo book loaded." : "Demo book already present.");

if (fs.existsSync(paths.contentDir)) {
  for (const bookId of fs.readdirSync(paths.contentDir)) {
    const dir = path.join(paths.contentDir, bookId);
    const metaFile = path.join(dir, "book-meta.json");
    if (!fs.existsSync(metaFile)) continue;
    const meta = BookMeta.parse(JSON.parse(fs.readFileSync(metaFile, "utf8")));
    const aFile = path.join(dir, "assessment.json");
    const assessment = fs.existsSync(aFile) ? BookAssessment.parse(JSON.parse(fs.readFileSync(aFile, "utf8"))) : null;
    const cur = getBook(bookId);
    upsertBook({ id: bookId, fileName: cur?.fileName ?? bookId, title: meta.title, series: meta.series, grade: meta.grade, meta, assessment, status: cur?.status ?? "needs-review" });
    let n = 0;
    for (const u of meta.units) {
      const unitId = `${bookId}-u${String(u.order).padStart(2, "0")}`;
      const f = path.join(dir, "units", `${unitId}.json`);
      if (!fs.existsSync(f) || getUnit(unitId)?.status === "approved") continue;
      const core = UnitExtractCore.parse(JSON.parse(fs.readFileSync(f, "utf8")));
      upsertUnit({ ...core, id: unitId, bookId, order: u.order, pages: [u.startPage, u.endPage] });
      n++;
    }
    console.log(`Synced ${meta.title}: ${n} unit(s).`);
  }
}

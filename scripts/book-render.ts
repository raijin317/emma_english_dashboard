/** npm run book:render — only renders PDF pages to PNG (no Claude). Useful to check a scan. */
import { scanBooks, gradeHintFromName } from "../src/server/books/scan";
import { renderPdfPages } from "../src/server/books/render";
import { bookPagesDir } from "../src/server/paths";

async function main() {
  for (const b of scanBooks()) {
    const t0 = Date.now();
    console.log(`• ${b.relPath} (${b.sizeMb} MB) — grade hint: ${gradeHintFromName(b.fileName) ?? "?"}`);
    const n = await renderPdfPages(b.file, bookPagesDir(b.bookId), {
      onPage: (p, total) => (p === total || p % 10 === 0) && console.log(`   page ${p}/${total}`),
    });
    console.log(`   ✓ ${n} pages in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${bookPagesDir(b.bookId)}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

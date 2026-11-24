import { scanBooks } from "../src/server/books/scan";
import { getBook } from "../src/server/repo";
import { paths } from "../src/server/paths";

const books = scanBooks();
if (!books.length) {
  console.log(`No PDF files found in ${paths.booksDir}`);
  console.log("Put your textbook PDFs there, then run: npm run book:import -- all");
  process.exit(0);
}
console.log(`Found ${books.length} PDF file(s) in ${paths.booksDir}\n`);
for (const b of books) {
  const known = getBook(b.bookId);
  const status = known ? `${known.status}${known.statusDetail ? " – " + known.statusDetail : ""}` : "new";
  console.log(`• ${b.relPath}  (${b.sizeMb} MB)\n    id: ${b.bookId}\n    status: ${status}`);
}

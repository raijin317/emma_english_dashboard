# resources/book — Textbook PDFs

Put your family's English textbooks here as PDF files (scanned/image PDFs are fine).

## Naming (recommended, not required)
`<grade>_<series>_<bookType>.pdf`

Examples:
- `G1_GlobalSuccess_StudentBook.pdf`
- `G1_GlobalSuccess_Workbook.pdf`
- `G3_SmartStart_StudentBook.pdf`
- `PreK_MyFirstEnglish_StudentBook.pdf`

Subfolders are allowed (e.g. `grade-1/`). The importer reads the pages to confirm the real title, grade and units.

## After adding books
```
npm run book:scan          # see what's new
npm run book:import -- all # read pages with Claude, extract units, assess level/age
```
Or use **Parent → Books → Import new books** in the app.

## Privacy
These files are for this family's personal use only. They are gitignored and never uploaded or shared by the app.

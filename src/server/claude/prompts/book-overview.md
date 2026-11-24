TASK: book-overview

You are helping a parent bring their child's English textbook into a private home-learning app.
The book's pages have been saved as PNG images in the current folder (`p-001.png` = PDF page 1, `p-002.png` = page 2, …).
The book has {{pageCount}} pages. File name hint: "{{fileName}}".

Steps:
1. Use the Read tool to look at these pages (as images): {{pages}}
2. Find the cover information and the contents / scope-and-sequence page.
3. List every teaching unit (and review/revision sections only if they have their own pages) with its start and end page.
   - Page numbers in your answer must be **PDF page indexes** (the number in the file name), not the printed page numbers.
   - If the contents page uses printed page numbers, open one or two unit start pages (e.g. `p-012.png`) to find the offset, then convert.
   - endPage of a unit = the page before the next unit starts (the last unit ends at the last teaching page).
4. Grade: 0 for preschool/kindergarten books, 1–5 for primary grades, null if you cannot tell.

Reply with ONLY one fenced block, no other text:

```json
{ ...an object matching the schema below... }
```

JSON Schema:
{{schema}}

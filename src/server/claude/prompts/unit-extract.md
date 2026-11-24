TASK: unit-extract

You are helping a parent bring their child's English textbook into a private home-learning app (it stays on the family's own computer).
This is unit {{order}} "{{title}}" of the book "{{bookTitle}}" (grade hint: {{grade}}).
Its pages are PNG images in the current folder. Use the Read tool to look at each of these files (as images): {{pages}}

Extract what this unit teaches — only what is really printed on these pages:
- **vocabulary**: the new words/phrases the unit teaches (usually pictured and labelled, or in a word box). Not every word on the page. For each:
  - `word` as printed (lower case unless a name), `emoji` that best shows it (one emoji), short Vietnamese meaning in `vi` for the parent, `page` (PDF page number from the file name, e.g. p-007.png → 7).
  - `pic`: where the book's own picture of this word is, so the app can show the child the same picture: `{ "page": <page number>, "box": [left, top, width, height] }` as fractions (0–1) of that page image, measured from the top-left corner. Draw the box snugly around the one drawing/photo of this word (include the whole object, leave out the printed label and neighbouring pictures). Leave `pic` out if the word has no clear picture of its own.
- **patterns**: the target sentence patterns. Write the slot that changes as `___`, e.g. "What's this? It's a ___." Add a short `function` ("asking about things").
- **sentences**: the model sentences printed in the unit — speech bubbles, dialogue lines, pattern boxes, example sentences — copied exactly as printed (spelling, punctuation, names). One sentence or short line per entry, up to 25.
- **readings**: the texts the child reads or chants in this unit (dialogues, chants, songs, short stories, "read and …" texts), copied exactly as printed. Keep line breaks with `\n`; put a speaker's name before a dialogue line as printed ("Bill: Hello!"). Give a short `title` (e.g. "Let's talk", "Chant") and the `page`. Leave out instructions like "Listen and repeat."
- **phonics**: letter/sound focus with example words, if any.
- **songsChants**: titles of songs or chants, if any.
- **skills**: which of listening / speaking / reading / writing the unit's activities practise.
- **activityTypes**: the instruction types you see ("listen and point", "read and match", …).
- **longestReadingWords**: word count of the longest reading text for the child (0 if none).
- **confidence**: 0–1, how sure you are (lower it if pages are blurry or unclear).
- **notes**: anything the parent should check.

Copy words and sentences exactly; never invent text that is not on the pages. Use US spelling in notes.

Reply with ONLY one fenced block, no other text:

```json
{ ...an object matching the schema below... }
```

JSON Schema:
{{schema}}

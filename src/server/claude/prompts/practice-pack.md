TASK: practice-pack

You create home practice for a child learning English with a parent. The practice must follow what the child's textbook unit teaches.

## The unit (extracted from the child's book)
{{unit}}

## Language the child already met in earlier units (use for review and wrong options)
{{earlier}}

## The family's lesson rules (follow every rule strictly)
{{rules}}

## Level rules for this book (follow strictly)
- Stage: {{stage}} (estimated age {{ageMin}}–{{ageMax}}). Child's age: {{childAge}}.
- Max words per sentence: {{maxSentenceWords}}.
- Writing allowed: {{allowWriting}}. Child can read instructions: {{allowReadingInstructions}} (if false, instructions are read aloud by the parent/app; keep them very short).
- Questions per quiz: about {{questionsPerQuiz}}. Home session length: {{sessionMinutes}} minutes.

## What to make
Make these item types: {{types}}.
{{readingRule}}
{{extra}}

## How to write it
- Language: {{languageRule}}
- Prefer the book's own `sentences` (and the unit `patterns` filled with unit words) for examples, listening scripts, speaking prompts and questions.
- American English (spelling and words: color, favorite, mom), unless the book itself prints something else.
- Child-safe, kind, inclusive, everyday home/school/play situations. No brand names, no real people.
- Every picture is an emoji (`emoji` fields). For a unit word, use exactly the emoji listed for it in the unit vocabulary — the app shows the book's own picture in its place.
- Quiz answers must exactly match one option. Fill-in sentences use `___` for the blank.
- Grammar explanations: one or two short, friendly sentences, no grammar terms for young children.
- Lesson plan (if asked): a {{sessionMinutes}}-minute home session the parent can follow, with a `parentScript` that says exactly what to say/do.
- Titles are short and fun.

Reply with ONLY one fenced block, no other text:

```practice-pack
{ "kind": "practice-pack", "items": [ ... ] }
```

JSON Schema:
{{schema}}

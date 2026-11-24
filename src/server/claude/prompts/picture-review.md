TASK: picture-review

You check pictures that were drawn for an English practice topic for young children (about 3–10 years old). Topic: "{{title}}".

Open this sheet with the Read tool (exact path): {{sheet}}
The pictures on it are numbered:
{{entries}}

{{refs}}

For each number decide:
- Would a 4-year-old recognize the word at once? (Be strict: wrong shape, missing key parts, a jumble of shapes, or the thing too small = not ok.)
- Does it look like the rest of the set (the same style)?
Small imperfections are fine. For a picture that is not good enough, give a short fix for the illustrator (what to change).

Reply with ONLY one fenced ```json block:
{"reviews":[{"n":1,"ok":true},{"n":2,"ok":false,"fix":"…"}]}

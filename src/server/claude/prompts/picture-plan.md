TASK: picture-plan

You choose pictures for the words of an English practice topic for young children (about 3–10 years old) in a family learning app.

Topic: "{{title}}" — {{description}}

Words (with the emoji the lesson shows today):
{{words}}

For each word, decide how to show it:
- "web": a real photo or illustration from an openly licensed picture library shows it well (animals, food, things, vehicles, places, clear actions). Give `query`: 1–4 English search words that find exactly this meaning in this topic (for example "bat animal" for the animal, "cookie biscuit" for the food).
- "draw": a simple drawing shows it better, or a photo could be confusing (for example "big", "happy", a made-up character).
- "emoji": the emoji already shows it best, or it can't be pictured (for example "hello", "please").

Never search for a person's name, a family member, a home address, a school or anything else about the family — use "draw" or "emoji" for those.

Reply with ONLY one fenced ```json block, every word once, spelled exactly as given:
{"words":[{"word":"…","show":"web","query":"…"},{"word":"…","show":"draw"}]}

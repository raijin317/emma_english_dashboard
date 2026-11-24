TASK: picture-style

You prepare the drawing style for the pictures of an English practice topic for young children (about 3–10 years old).
Topic: "{{title}}" — {{description}}

{{refs}}

The words that will be drawn (one picture each, as simple SVG vector art):
{{words}}

Describe the style so that an illustrator can draw NEW pictures of these words that look like they belong to the same set:
- summary: one short sentence for the parent, e.g. "Soft pastel animals with thin brown outlines and rosy cheeks".
- palette: 5–8 hex colors (main colors, accents, outline color, background color).
- outline: color and thickness in a 256×256 picture (e.g. "#5d4037, about 4 px, rounded"), or "none".
- fill: flat colors, soft gradients, light shading, a paper/crayon/watercolor texture…
- shapes: round or geometric, proportions (big heads, short legs…), how eyes and faces look.
- background: none, a soft circle, a small ground shadow…
- details: anything else that makes the style recognizable (highlights, patterns, line wobble…).
Take only the LOOK from the pictures: never their characters, logos, brands or text. The style must be possible to draw well with SVG shapes.

Reply with ONLY one fenced ```json block:
{"summary":"…","palette":["#…","#…"],"outline":"…","fill":"…","shapes":"…","background":"…","details":"…"}

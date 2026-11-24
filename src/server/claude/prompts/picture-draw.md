TASK: picture-draw

You draw pictures for an English practice topic for young children (about 3–10 years old). Topic: "{{title}}".

The style — use it for every picture, so all the pictures of the topic look like one set:
{{style}}

Words:
{{words}}

For each word, draw ONE picture that a young child recognizes at once, as an SVG:
- the thing is big and centered, in its most typical view, filling about 70–85% of the picture; show the parts that make it recognizable (a giraffe's long neck and spots, a car's wheels and windows);
- follow the style above: use its palette, outlines, fills/shading, shapes, faces and background;
- no text, letters or numbers; nothing scary; never copy characters, logos or brands.
- Exactly: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"> … </svg>
- Allowed elements: g, path, circle, ellipse, rect, line, polyline, polygon, defs, linearGradient, radialGradient, stop, clipPath, mask, pattern, and filter with feGaussianBlur, feTurbulence, feDisplacementMap, feColorMatrix, feOffset, feBlend, feComposite, feFlood, feMerge, feMergeNode (for soft, watercolor or crayon looks). Only references inside the picture (url(#id)). No text, image, use, script, style elements, links or event attributes.
- Keep each SVG under 7000 characters.
If a word can't be shown as a picture (for example "please" or "hello"), use null.

Reply with ONLY one fenced ```json block (the SVG is a JSON string, so escape its quotes):
{"pictures":[{"word":"…","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\">…</svg>"}]}

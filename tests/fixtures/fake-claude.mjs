#!/usr/bin/env node
// Fake Claude Code CLI for tests: speaks the `-p --output-format stream-json` protocol.
// Usage in tests: CLAUDE_CLI_PATH="node tests/fixtures/fake-claude.mjs"
import fs from "node:fs";

const argv = process.argv.slice(2);
if (argv.includes("--version")) {
  console.log("9.9.9 (Fake Claude Code)");
  process.exit(0);
}
if (process.env.FAKE_CLAUDE_ARGS_LOG) fs.appendFileSync(process.env.FAKE_CLAUDE_ARGS_LOG, JSON.stringify({ argv, cwd: process.cwd() }) + "\n");

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  const resumeIdx = argv.indexOf("--resume");
  const session = resumeIdx >= 0 ? argv[resumeIdx + 1] : "fake-session-" + Math.random().toString(36).slice(2, 8);
  const reply = respond(input);
  const emit = (o) => process.stdout.write(JSON.stringify(o) + "\n");
  emit({ type: "system", subtype: "init", session_id: session });
  if (argv.includes("--include-partial-messages")) {
    for (let i = 0; i < reply.length; i += 40) emit({ type: "stream_event", session_id: session, event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: reply.slice(i, i + 40) } } });
  }
  emit({ type: "assistant", session_id: session, message: { content: [{ type: "text", text: reply }] } });
  emit({ type: "result", subtype: "success", is_error: false, result: reply, session_id: session, total_cost_usd: 0.001 });
});

const fence = (tag, obj) => "```" + tag + "\n" + JSON.stringify(obj, null, 1) + "\n```";

function respond(prompt) {
  if (prompt.includes("TASK: book-overview")) {
    const pages = Number((prompt.match(/The book has (\d+) pages/) || [])[1] || 4);
    const units = [];
    for (let p = 2, o = 1; p <= pages; p += 2, o++) units.push({ order: o, title: `Unit ${o}`, startPage: p, endPage: Math.min(p + 1, pages) });
    return fence("json", { title: "Fake English Book 2", series: "Fake Series", bookType: "student-book", grade: 2, units });
  }
  if (prompt.includes("TASK: unit-extract")) {
    const order = Number((prompt.match(/This is unit (\d+)/) || [])[1] || 1);
    const sets = [
      [["cat", "🐱"], ["dog", "🐶"], ["bird", "🐦"], ["fish", "🐟"]],
      [["apple", "🍎"], ["banana", "🍌"], ["milk", "🥛"], ["bread", "🍞"]],
    ];
    const words = sets[(order - 1) % sets.length];
    const pets = order % 2 === 1;
    return fence("json", {
      title: `Unit ${order}`,
      topic: pets ? "pets" : "food",
      // The last box runs off the page on purpose: it must be clamped, not rejected.
      vocabulary: words.map(([word, emoji], k) => ({ word, emoji, vi: "nghĩa", page: order * 2, pic: { page: order * 2, box: [0.1 + k * 0.2, 0.3, k === 3 ? 0.5 : 0.15, 0.2] } })),
      patterns: [{ text: pets ? "I have a ___." : "I like ___.", function: "talking about things" }],
      sentences: pets ? ["I have a cat.", "I have a dog.", "It's a bird."] : ["I like apples.", "I like milk."],
      readings: pets
        ? [{ title: "Let's talk", text: "Mai: What's this?\nBen: It's a cat.\nMai: I have a dog.", page: order * 2 }]
        : [{ title: "Chant", text: "Apple, apple, I like apples!\nMilk, milk, I like milk!", page: order * 2 }],
      skills: ["listening", "speaking", "reading"],
      activityTypes: ["listen and point"],
      longestReadingWords: 30,
      confidence: 0.9,
    });
  }
  // Pictures for AI Studio topics: greetings keep their emoji, the rest is searched on the web;
  // the first word's sheet → picture 2, the others "none good" → drawn.
  const listed = () => [...prompt.matchAll(/^- "([^"]+)"/gm)].map((m) => m[1]);
  if (prompt.includes("TASK: picture-plan")) {
    return fence("json", { words: listed().map((w) => (/^(hello|please|thank)/i.test(w) ? { word: w, show: "emoji" } : { word: w, show: "web", query: `${w} cartoon` })) });
  }
  if (prompt.includes("TASK: picture-pick")) {
    return fence("json", { picks: listed().map((w, k) => ({ word: w, pick: k === 0 ? 2 : 0 })) });
  }
  // The style: from the parent's pictures when the prompt lists them (ref-N), otherwise one chosen for the topic.
  if (prompt.includes("TASK: picture-style")) {
    const fromPictures = /ref-\d\.(jpg|png|webp)/.test(prompt);
    return fence("json", {
      summary: fromPictures ? "Soft crayon drawings like the parent's pictures" : "Bright flat cartoon for the topic",
      palette: fromPictures ? ["#123456", "#abcdef", "#fedcba"] : ["#4fc3f7", "#ff6b9a", "#66bb6a"],
      outline: "#2b2d42, 6 px",
      fill: "flat",
      shapes: "round",
      background: "none",
      details: "",
    });
  }
  // Drawings use the style's first palette color; a redraw (with "not good enough") is marked id="fixed".
  if (prompt.includes("TASK: picture-draw")) {
    const colors = ["4fc3f7", "ff6b9a", "66bb6a", "ffc83d"];
    const palette = /Colors \(palette\): #([0-9a-f]{6})/i.exec(prompt)?.[1];
    return fence("json", {
      pictures: [...prompt.matchAll(/^- "([^"]+)"(.*)$/gm)].map((m, k) => ({
        word: m[1],
        svg: /^(hello|please|thank)/i.test(m[1]) ? null : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><g id="${/not good enough/.test(m[2]) ? "fixed" : "first"}"><circle cx="128" cy="128" r="90" fill="#${k === 0 && palette ? palette : colors[k % colors.length]}" stroke="#2b2d42" stroke-width="8"/><rect x="88" y="100" width="80" height="40" rx="10" fill="#fff"/></g></svg>`,
      })),
    });
  }
  // The check: picture 2 on the sheet is "not good enough".
  if (prompt.includes("TASK: picture-review")) {
    const n = [...prompt.matchAll(/^(\d+) = "/gm)].length;
    return fence("json", { reviews: Array.from({ length: n }, (_, k) => (k === 1 ? { n: 2, ok: false, fix: "make the ears bigger" } : { n: k + 1, ok: true })) });
  }
  if (prompt.includes("TASK: practice-pack")) {
    if (prompt.includes("FAKE_INVALID_ONCE") && !prompt.includes("did not match the schema")) return fence("practice-pack", { kind: "practice-pack", items: [] });
    return fence("practice-pack", {
      kind: "practice-pack",
      items: [
        { type: "vocabulary", title: "Pets", data: { words: [{ word: "cat", emoji: "🐱" }, { word: "dog", emoji: "🐶" }] } },
        { type: "quiz", title: "Pet quiz", data: { questions: [{ kind: "mc", prompt: "What is this?", emoji: "🐱", options: ["cat", "dog"], answer: "cat" }] } },
        // Breaks the family's rules on purpose (invented story; a word that isn't in the book).
        { type: "reading", title: "A new story", data: { passage: "Tom has a big red ball.", questions: [{ kind: "tf", statement: "Tom has a ball.", answer: true }] } },
        {
          type: "listening",
          title: "Listen",
          data: { tasks: [{ say: "a dinosaur", question: "Which one?", options: [{ emoji: "🦖", label: "dinosaur" }, { emoji: "🐱", label: "cat" }], answer: "dinosaur" }] },
        },
      ],
    });
  }
  if (prompt.includes("did not match the schema")) {
    return fence("practice-pack", { kind: "practice-pack", items: [{ type: "vocabulary", title: "Fixed", data: { words: [{ word: "cat", emoji: "🐱" }] } }] });
  }
  // Studio chat with an attached file: build the pack from the file's text.
  const fileName = (prompt.match(/\[File 1\] "([^"]+)"/) || [])[1];
  if (fileName) {
    const fileText = (prompt.match(/<<<\n([\s\S]*?)\n>>>/) || [])[1] || "";
    const words = [...new Set(fileText.toLowerCase().match(/[a-z]{4,}/g) || [])].filter((w) => !["fruit", "words"].includes(w)).slice(0, 4);
    return (
      `I read ${fileName}: ${words.join(", ")}.\n\n` +
      fence("inspiration-pack", {
        kind: "inspiration-pack",
        topic: { title: `From ${fileName}`, emoji: "📄", description: "Made from the attached file", stage: "early-reader" },
        items: [{ type: "vocabulary", title: "Words from the file", data: { words: words.map((word) => ({ word, emoji: "⭐" })) } }],
      })
    );
  }
  // Studio chat
  if (/make|create/i.test(prompt)) {
    return (
      "Here is a dinosaur set! 🦖\n\n" +
      fence("inspiration-pack", {
        kind: "inspiration-pack",
        topic: { title: "Dinosaurs", emoji: "🦖", description: "Big and small dinosaurs", stage: "early-reader" },
        items: [{ type: "vocabulary", title: "Dino words", data: { words: [{ word: "big", emoji: "🦕" }, { word: "small", emoji: "🦎" }, { word: "egg", emoji: "🥚" }] } }],
      })
    );
  }
  return "Sure! What topic would your child enjoy?";
}

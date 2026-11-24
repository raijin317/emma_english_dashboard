import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createCanvas } from "@napi-rs/canvas";

// Isolated folders + fake Claude + a fake Openverse on localhost. Env must be set before the server modules load.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-pics-"));
process.env.APP_DB_FILE = path.join(tmp, "app.db");
process.env.TOPICS_DIR = path.join(tmp, "topics");
process.env.STUDIO_DIR = path.join(tmp, "studio");
process.env.CLAUDE_CLI_PATH = `"${process.execPath}" "${path.resolve("tests/fixtures/fake-claude.mjs")}"`;
let server: http.Server;
let base = "";
const searches: string[] = [];

async function png(color: string) {
  const c = createCanvas(400, 300);
  const ctx = c.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 400, 300);
  return Buffer.from(await c.encode("png"));
}

beforeAll(async () => {
  const colors = ["#e53935", "#43a047", "#1e88e5", "#fdd835"];
  server = http.createServer(async (req, res) => {
    const u = new URL(req.url!, "http://x");
    if (u.pathname === "/v1/images/") {
      const q = u.searchParams.get("q")!;
      searches.push(q);
      const results = colors.map((_, k) => ({
        title: `${q} ${k + 1}`,
        creator: `Maker ${k + 1}`,
        license: "by",
        license_version: "2.0",
        license_url: "https://creativecommons.org/licenses/by/2.0/",
        foreign_landing_url: `https://example.org/${k}`,
        url: k === 2 ? `${base}/missing.png` : `${base}/img/${k}.png`, // one picture is gone: skipped
        filetype: "png",
        width: 400,
        height: 300,
      }));
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify({ result_count: results.length, results }));
    }
    const m = /^\/img\/(\d)\.png$/.exec(u.pathname);
    if (m) {
      res.setHeader("content-type", "image/png");
      return res.end(await png(colors[Number(m[1])]));
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.OPENVERSE_URL = `${base}/v1`;
});
afterAll(() => {
  server?.close();
});

async function makeTopic() {
  const repo = await import("@/server/repo");
  const t = repo.createTopic({ title: "Pets", emoji: "ðŸ¾", description: "Pets at home", stage: "early-reader" });
  repo.createItem({ source: "inspiration", bookId: null, unitId: null, inspirationTopicId: t.id, type: "vocabulary", title: "Pet words", status: "draft", stage: "early-reader", data: { words: [{ word: "cat", emoji: "ðŸ±" }, { word: "dog", emoji: "ðŸ¶" }, { word: "hello", emoji: "ðŸ‘‹" }] }, createdBy: "claude" });
  repo.createItem({ source: "inspiration", bookId: null, unitId: null, inspirationTopicId: t.id, type: "quiz", title: "Pet quiz", status: "draft", stage: "early-reader", data: { questions: [{ kind: "picture", prompt: "Find the cat.", options: [{ emoji: "ðŸ±", label: "cat" }, { emoji: "ðŸŸ", label: "a fish" }], answer: "cat" }] }, createdBy: "claude" });
  return t.id;
}

describe("AI Studio topic pictures", () => {
  it("collects the topic's words once, from every kind of item", async () => {
    const { topicWords } = await import("@/lib/topicPictures");
    const words = topicWords([
      { data: { words: [{ word: "Cat", emoji: "ðŸ±" }, { word: "dog", emoji: "ðŸ¶" }] } },
      { data: { questions: [{ kind: "picture", options: [{ emoji: "ðŸ±", label: "a cat" }, { emoji: "ðŸŸ", label: "fish" }] }, { kind: "match", pairs: [{ emoji: "ðŸ¶", word: "dog" }] }] } },
      { data: { words: [{ word: "a very long phrase here", emoji: "ðŸ§©" }] } },
    ]);
    expect(words.map((w) => w.key)).toEqual(["cat", "dog", "fish"]);
    expect(new Set(words.map((w) => w.slug)).size).toBe(3);
  });

  it("finds web pictures, lets Claude pick, draws the rest, keeps the emoji for greetings", async () => {
    const id = await makeTopic();
    const { findTopicPictures, readCandidates } = await import("@/server/pictureJob");
    const { getTopicPictures } = await import("@/server/repo");
    const r = await findTopicPictures(id, { mode: "web" });
    // cat from the web; dog + fish drawn, Claude's check sent the 2nd drawing back once.
    expect(r).toEqual({ words: 4, web: 1, drawn: 2, fixed: 1 });
    // Claude's search words were used (never the greeting).
    expect(searches.sort()).toEqual(["a fish cartoon", "cat cartoon", "dog cartoon"]);
    const pics = getTopicPictures(id);
    expect(pics.cat).toMatchObject({ source: "web", file: "c2.jpg", credit: { creator: "Maker 2", license: "by" } });
    expect(pics.dog).toMatchObject({ source: "ai", file: "ai.png" });
    expect(pics.fish).toMatchObject({ source: "ai" });
    expect(pics.hello).toBeUndefined();
    // The broken picture was skipped: 3 candidates kept, with a numbered sheet for Claude.
    expect(readCandidates(id, pics.cat.slug).map((c) => c.file)).toEqual(["c1.jpg", "c2.jpg", "c3.jpg"]);
    expect(fs.existsSync(path.join(process.env.TOPICS_DIR!, id, pics.cat.slug, "sheet.jpg"))).toBe(true);
    // The players get the pictures by word and by emoji.
    const { picturesForTopic, chooseTopicPicture, topicPictureFile } = await import("@/server/topicPictures");
    const map = picturesForTopic(id);
    expect(map["w:cat"]).toMatch(new RegExp(`^/api/topics/${id}/pictures/${pics.cat.slug}/c2\\.jpg\\?v=\\d+$`));
    expect(map["e:ðŸ±"]).toBe(map["w:cat"]);
    expect(map["w:hello"]).toBeUndefined();
    // The parent can choose another web picture, or the emoji.
    expect(chooseTopicPicture(id, "cat", "c3.jpg")).toBe(true);
    expect(getTopicPictures(id).cat.credit?.creator).toBe("Maker 4");
    expect(chooseTopicPicture(id, "cat", "../../app.db")).toBe(false);
    expect(chooseTopicPicture(id, "cat", null)).toBe(true);
    expect(getTopicPictures(id).cat).toBeUndefined();
    // Only real picture files are served.
    expect(topicPictureFile(id, pics.dog.slug, "ai.png")).toBeTruthy();
    expect(topicPictureFile(id, pics.dog.slug, "candidates.json")).toBeNull();
    expect(topicPictureFile(id, "../x", "ai.png")).toBeNull();
  });

  it("without internet, Claude draws the pictures", async () => {
    const id = await makeTopic();
    const saved = process.env.OPENVERSE_URL;
    process.env.OPENVERSE_URL = "http://127.0.0.1:9/v1"; // nothing listens there
    try {
      const { findTopicPictures } = await import("@/server/pictureJob");
      const r = await findTopicPictures(id, { mode: "web" });
      expect(r).toEqual({ words: 4, web: 0, drawn: 3, fixed: 1 });
    } finally {
      process.env.OPENVERSE_URL = saved;
    }
  });

  it("'Claude draws' never searches the web; 'emoji only' makes nothing", async () => {
    const id = await makeTopic();
    const before = searches.length;
    const { findTopicPictures } = await import("@/server/pictureJob");
    expect(await findTopicPictures(id, { mode: "draw" })).toEqual({ words: 4, web: 0, drawn: 3, fixed: 1 }); // "hello" keeps its emoji
    expect(searches.length).toBe(before);
    const other = await makeTopic();
    expect(await findTopicPictures(other, { mode: "off" })).toEqual({ words: 4, web: 0, drawn: 0, fixed: 0 });
  });

  it("is the default: Claude draws every picture", async () => {
    const { getAppSettings } = await import("@/server/repo");
    expect(getAppSettings().topicPictures).toBe("draw");
  });

  it("draws in the style of the pictures attached in the chat, checks the drawings and redraws the weak one", async () => {
    const repo = await import("@/server/repo");
    const { styleFromChat, topicPicturesView, topicPictureFile } = await import("@/server/topicPictures");
    const { findTopicPictures } = await import("@/server/pictureJob");
    const { readStyle } = await import("@/server/pictureStyle");
    // A chat with one attached picture (as AI Studio stores it: data/studio/<thread>/<file>/img-01.jpg).
    const th = repo.createThread("Pets");
    const fileDir = path.join(process.env.STUDIO_DIR!, th.id, "f_style1");
    fs.mkdirSync(fileDir, { recursive: true });
    const c = createCanvas(300, 300);
    c.getContext("2d").fillRect(20, 20, 100, 100);
    fs.writeFileSync(path.join(fileDir, "img-01.jpg"), Buffer.from(await c.encode("jpeg", 80)));
    const file = { id: "f_style1", name: "style.jpg", kind: "image" as const, size: 1, parts: null, chars: 0, images: [{ file: "img-01.jpg", label: "the picture" }], thumb: null, note: null, createdAt: "" };
    repo.addMessage(th.id, "user", "Make a pets topic in this style", null, [file]);

    const id = await makeTopic();
    expect(styleFromChat(th.id, id)).toBe(1);
    expect(topicPicturesView(id).style.refs.map((r) => r.file)).toEqual(["ref-1.jpg"]);
    expect(topicPictureFile(id, "style", "ref-1.jpg")).toBeTruthy();
    expect(topicPictureFile(id, "style", "style.json")).toBeNull();

    const r = await findTopicPictures(id, { mode: "draw" });
    expect(r).toEqual({ words: 4, web: 0, drawn: 3, fixed: 1 });
    // Claude looked at the parent's picture and wrote the style down; the drawings use its colors.
    expect(readStyle(id)).toMatchObject({ from: "pictures", summary: "Soft crayon drawings like the parent's pictures" });
    const pics = repo.getTopicPictures(id);
    const svg = (key: string) => fs.readFileSync(path.join(process.env.TOPICS_DIR!, id, pics[key].slug, "ai.svg"), "utf8");
    expect(svg("cat")).toContain("#123456");
    // The drawing Claude's check sent back (2nd on the sheet) was drawn again; the others were kept.
    expect(svg("dog")).toContain('id="fixed"');
    expect(svg("cat")).toContain('id="first"');
    expect(fs.existsSync(path.join(process.env.TOPICS_DIR!, id, "review.jpg"))).toBe(true);
    expect(topicPicturesView(id).style).toMatchObject({ summary: "Soft crayon drawings like the parent's pictures", from: "pictures", outdated: false });

    // Removing the style picture makes the style out of date; the next run works it out again (now for the topic).
    const { removeStyleRef, addStyleRef } = await import("@/server/topicPictures");
    expect(removeStyleRef(id, "ref-1.jpg")).toBe(true);
    expect(topicPicturesView(id).style.outdated).toBe(true);
    await findTopicPictures(id, { mode: "draw", only: ["cat"], drawOnly: true });
    expect(readStyle(id)).toMatchObject({ from: "topic" });
    // Only real pictures are accepted as style pictures.
    expect(() => addStyleRef(id, Buffer.from("not a picture"))).toThrow(/JPG, PNG or WebP/);
    expect(addStyleRef(id, fs.readFileSync(path.join(fileDir, "img-01.jpg")))).toBe("ref-1.jpg");
  });

  it("accepts only plain-shape SVG drawings", async () => {
    const { safeSvg, svgToPng } = await import("@/server/pictureSearch");
    const ok = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="red"/></svg>';
    expect(safeSvg(ok)).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(await svgToPng(ok)).toBeInstanceOf(Buffer);
    for (const bad of [
      '<svg><script>alert(1)</script></svg>',
      '<svg onload="x()"><circle r="4"/></svg>',
      '<svg><image href="http://x/y.png"/></svg>',
      '<svg><rect fill="url(http://x/y)"/></svg>',
      '<svg><text>hi</text></svg>',
      '<svg><foreignObject/></svg>',
    ])
      expect(safeSvg(bad)).toBeNull();
    // Nothing drawn (all white) is not a picture.
    expect(await svgToPng('<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#fff"/></svg>')).toBeNull();
  });

  it("uses a smaller Wikimedia picture instead of a huge original", async () => {
    const { smallerUrl } = await import("@/server/pictureSearch");
    expect(smallerUrl("https://upload.wikimedia.org/wikipedia/commons/a/ab/Cat.jpg", 4000)).toBe("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Cat.jpg/640px-Cat.jpg");
    expect(smallerUrl("https://upload.wikimedia.org/wikipedia/commons/a/ab/Cat.svg", 300)).toBe("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Cat.svg/640px-Cat.svg.png");
    expect(smallerUrl("https://live.staticflickr.com/1/2_b.jpg", 1024)).toBe("https://live.staticflickr.com/1/2_b.jpg");
  });
});

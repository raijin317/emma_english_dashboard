import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { makePdf } from "./helpers/makePdf";
import { makeDocx, makeZip, oleBytes } from "./helpers/office";

// Isolated folders + fake CLI. Env must be set before the server modules load.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-files-"));
process.env.APP_DB_FILE = path.join(tmp, "app.db");
process.env.STUDIO_DIR = path.join(tmp, "studio");
process.env.CLAUDE_CLI_PATH = `"${process.execPath}" "${path.resolve("tests/fixtures/fake-claude.mjs")}"`;
const argsLog = path.join(tmp, "args.log");
process.env.FAKE_CLAUDE_ARGS_LOG = argsLog;

let prep: typeof import("@/server/files/prepare");
let zipMod: typeof import("@/server/files/zip");
let jobs: typeof import("@/server/claude/jobs");
let studio: typeof import("@/server/studioFiles");

beforeAll(async () => {
  prep = await import("@/server/files/prepare");
  zipMod = await import("@/server/files/zip");
  jobs = await import("@/server/claude/jobs");
  studio = await import("@/server/studioFiles");
});

async function png(w: number, h: number, color = "#3b82f6") {
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  return Buffer.from(await c.encode("png"));
}

let n = 0;
/** Writes `buf` as `name` into a fresh folder and prepares it. */
async function prepare(name: string, buf: Buffer) {
  const dir = path.join(tmp, "prep", String(++n));
  fs.mkdirSync(dir, { recursive: true });
  const source = path.join(dir, "source" + path.extname(name));
  fs.writeFileSync(source, buf);
  const info = await prep.prepareStudioFile(dir, { id: `f_${n}`, name, source });
  const text = fs.existsSync(path.join(dir, "text.md")) ? fs.readFileSync(path.join(dir, "text.md"), "utf8") : "";
  return { dir, info, text };
}

const P = (inner: string, ppr = "") => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${inner}</w:p>`;
const R = (t: string) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;

describe("zip reader", () => {
  it("reads stored and deflated entries, names case-insensitively", () => {
    for (const store of [false, true]) {
      const zip = zipMod.readZip(makeZip({ "Word/Document.xml": "<x>héllo</x>", "a/b.txt": "b" }, { store }));
      expect(zipMod.zipText(zip, "word/document.xml")).toBe("<x>héllo</x>");
      expect(zip.get("a/b.txt")?.read().toString()).toBe("b");
    }
  });

  it("refuses password-protected and non-zip data", () => {
    expect(() => zipMod.readZip(makeZip({ "a.txt": "x" }, { encrypted: true }))).toThrow(/password/);
    expect(() => zipMod.readZip(Buffer.from("not a zip at all, just some text here"))).toThrow(/Not a ZIP/);
  });
});

describe("attached files → text + pictures", () => {
  it("Word: headings, lists, tables, text boxes once, tabs, entities and pictures in order", async () => {
    const body =
      P(R("My Family"), `<w:pStyle w:val="Heading1"/>`) +
      P(R("This is my ") + R("mother &amp; father."), `<w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs>`) +
      P(R("grandma"), `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>`) +
      `<w:tbl><w:tblPr/><w:tr><w:tc>${P(R("word"))}</w:tc><w:tc>${P(R("meaning"))}</w:tc></w:tr><w:tr><w:tc>${P(R("sister"))}</w:tc><w:tc>${P(R("chị/em gái"))}</w:tc></w:tr></w:tbl>` +
      P(
        `<w:r><mc:AlternateContent xmlns:mc="m"><mc:Choice Requires="wps"><w:drawing><w:txbxContent>${P(R("Box text"))}</w:txbxContent></w:drawing></mc:Choice><mc:Fallback><w:pict><w:txbxContent>${P(R("Box text"))}</w:txbxContent></w:pict></mc:Fallback></mc:AlternateContent></w:r>` +
          `<w:r><w:t>Look</w:t><w:tab/><w:t>here</w:t><w:br/><w:t>now</w:t></w:r>`,
      ) +
      P(`<w:r><w:drawing><a:blip xmlns:a="a" r:embed="rId2"/></w:drawing></w:r>`) +
      P(`<w:r><w:drawing><a:blip xmlns:a="a" r:embed="rId3"/></w:drawing></w:r>`) +
      P(`<w:r><w:drawing><a:blip xmlns:a="a" r:embed="rId1"/></w:drawing></w:r>`);
    const { info, text, dir } = await prepare("family.docx", makeDocx(body, [await png(120, 90), await png(200, 100, "#f00"), await png(12, 12)]));
    expect(info.kind).toBe("word");
    expect(text).toBe(["# My Family", "This is my mother & father.", "- grandma", "| word | meaning |", "| sister | chị/em gái |", "", "Box text", "Look\there\nnow"].join("\n"));
    // rId2 (red, 200×100) comes first in the document; the 12px picture is skipped.
    expect(info.images.map((i) => i.label)).toEqual(["picture 1", "picture 2"]);
    expect((await loadImage(fs.readFileSync(path.join(dir, "img-01.jpg")))).width).toBe(200);
    expect(info.thumb).toBe("thumb.jpg");
    expect(JSON.parse(fs.readFileSync(path.join(dir, "info.json"), "utf8")).id).toBe(info.id);
  });

  it("Excel: sheets in order, shared/inline strings, numbers, dates, booleans; hidden sheets and empty columns skipped", async () => {
    const rel = (id: string, target: string) => `<Relationship Id="${id}" Type="x/worksheet" Target="${target}"/>`;
    const xlsx = makeZip({
      "xl/workbook.xml": `<workbook xmlns:r="r"><sheets><sheet name="Words" sheetId="1" r:id="rId1"/><sheet name="Secret" sheetId="2" state="hidden" r:id="rId2"/><sheet name="Plan &amp; dates" sheetId="3" r:id="rId3"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<Relationships>${rel("rId1", "worksheets/sheet1.xml")}${rel("rId2", "worksheets/sheet2.xml")}${rel("rId3", "/xl/worksheets/sheet3.xml")}</Relationships>`,
      "xl/sharedStrings.xml": `<sst><si><t>word</t></si><si><r><t>pic</t></r><r><t>ture</t></r><rPh><t>ignored</t></rPh></si><si><t>cat</t></si></sst>`,
      "xl/styles.xml": `<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>`,
      "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2" t="inlineStr"><is><t>🐱 &lt;3</t></is></c></row><row r="3"/></sheetData></worksheet>`,
      "xl/worksheets/sheet2.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>answers</t></is></c></row></sheetData></worksheet>`,
      "xl/worksheets/sheet3.xml": `<worksheet><sheetData><row r="1"><c r="A1"><v>3.0000000000000004</v></c><c r="B1" s="1"><v>45658</v></c><c r="C1" t="b"><v>1</v></c><c r="D1" t="str"><v>done</v></c></row></sheetData></worksheet>`,
    });
    const { info, text } = await prepare("words.xlsx", xlsx);
    expect(info.kind).toBe("excel");
    expect(info.parts).toBe(2);
    expect(text).toBe(["## Sheet: Words", "| word | picture |", "| cat | 🐱 <3 |", "", "## Sheet: Plan & dates", "| 3 | 2025-01-01 | TRUE | done |"].join("\n"));
    expect(text).not.toContain("answers");
  });

  it("PowerPoint: slides in presentation order, tables, notes without the slide number, pictures per slide", async () => {
    const rel = (id: string, type: string, target: string) => `<Relationship Id="${id}" Type="http://x/${type}" Target="${target}"/>`;
    const slide = (body: string) => `<p:sld xmlns:p="p" xmlns:a="a" xmlns:r="r"><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`;
    const sp = (...paras: string[]) => `<p:sp><p:txBody>${paras.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join("")}</p:txBody></p:sp>`;
    const pptx = makeZip({
      "ppt/presentation.xml": `<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId id="256" r:id="rId9"/><p:sldId id="257" r:id="rId8"/></p:sldIdLst></p:presentation>`,
      "ppt/_rels/presentation.xml.rels": `<Relationships>${rel("rId8", "slide", "slides/slide1.xml")}${rel("rId9", "slide", "slides/slide2.xml")}</Relationships>`,
      "ppt/slides/slide2.xml": slide(sp("Animals", "a cat<a:br/>a dog") + `<p:pic><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic>`),
      "ppt/slides/_rels/slide2.xml.rels": `<Relationships>${rel("rId1", "image", "../media/image1.png")}${rel("rId2", "notesSlide", "../notesSlides/notesSlide1.xml")}</Relationships>`,
      "ppt/notesSlides/notesSlide1.xml": slide(sp("Ask: what is it?") + sp("1")),
      "ppt/slides/slide1.xml": slide(
        sp("Quiz") +
          `<p:graphicFrame><a:graphic><a:graphicData><a:tbl><a:tblGrid/><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Q</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>A</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`,
      ),
      "ppt/media/image1.png": await png(300, 200),
    });
    const { info, text } = await prepare("animals.pptx", pptx);
    expect(info.kind).toBe("powerpoint");
    expect(info.parts).toBe(2);
    expect(text).toBe(["## Slide 1", "Animals", "a cat", "a dog", "Notes: Ask: what is it?", "", "## Slide 2", "Quiz", "| Q | A |"].join("\n"));
    expect(info.images).toEqual([{ file: "img-01.jpg", label: "slide 1" }]);
  });

  it("PDF: text of every page + pictures of the pages to look at", async () => {
    const { info, text, dir } = await prepare("lesson.pdf", makePdf(["Hello cat", "Big dog"]));
    expect(info.kind).toBe("pdf");
    expect(info.parts).toBe(2);
    expect(text).toContain("## Page 1\nHello cat");
    expect(text).toContain("## Page 2\nBig dog");
    expect(info.images.map((i) => i.label)).toEqual(["page 1", "page 2"]);
    expect(fs.existsSync(path.join(dir, "img-02.jpg"))).toBe(true);
  });

  it("Pictures are resized for Claude and get a thumbnail", async () => {
    const { info, dir } = await prepare("board.png", await png(2400, 1200));
    expect(info).toMatchObject({ kind: "image", chars: 0, images: [{ file: "img-01.jpg", label: "the picture" }], thumb: "thumb.jpg" });
    const img = await loadImage(fs.readFileSync(path.join(dir, "img-01.jpg")));
    expect([img.width, img.height]).toEqual([1568, 784]);
    expect((await loadImage(fs.readFileSync(path.join(dir, "thumb.jpg")))).width).toBe(320);
  });

  it("CSV / text files are read as text", async () => {
    const { info, text } = await prepare("words.csv", Buffer.from("﻿word,meaning\r\ncat,con mèo\r\n"));
    expect(info.kind).toBe("text");
    expect(text).toBe("word,meaning\ncat,con mèo");
  });

  it("explains files it can't read in plain words", async () => {
    await expect(prepare("lesson.doc", oleBytes())).rejects.toThrow(/old Word file.*Save As.*\.docx/);
    await expect(prepare("photo.heic", Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(40)]))).rejects.toThrow(/HEIC/);
    await expect(prepare("thing.xyz", Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9]))).rejects.toThrow(/can't be used/);
    await expect(prepare("broken.png", Buffer.concat([Buffer.from([0x89]), Buffer.from("PNG\r\n"), Buffer.alloc(20)]))).rejects.toThrow(/picture could not be opened/);
    await expect(prepare("notes.zip", makeZip({ "a.txt": "x" }))).rejects.toThrow(/not a Word, Excel or PowerPoint/);
    await expect(prepare("empty.docx", makeDocx(""))).rejects.toThrow(/Nothing could be read/);
    await expect(prepare("secret.docx", makeZip({ "word/document.xml": "<x/>" }, { encrypted: true }))).rejects.toThrow(/password/);
  });
});

describe("AI Studio with files", () => {
  it("upload: saved in the chat's folder and read in its own process", async () => {
    const info = await studio.addStudioFile("th_test1", new File([new Uint8Array(makePdf(["Fruits apple banana"]))], "fruits.pdf"));
    expect(info).toMatchObject({ name: "fruits.pdf", kind: "pdf", parts: 1 });
    expect(studio.readStudioFile("th_test1", info.id)).toEqual(info);
    expect(studio.studioFileText("th_test1", info.id)).toContain("Fruits apple banana");
    await expect(studio.addStudioFile("th_test1", new File([new Uint8Array(oleBytes())], "old.xls"))).rejects.toThrow(/old Excel file/);
    // A refused file leaves nothing behind.
    expect(fs.readdirSync(studio.studioThreadDir("th_test1"))).toEqual([info.id]);
    expect(studio.readStudioFile("../etc", info.id)).toBeNull();
    studio.removeStudioThread("th_test1");
    expect(fs.existsSync(studio.studioThreadDir("th_test1"))).toBe(false);
  }, 30_000);

  it("the prompt carries the file text and the pictures to open; long text points to text.md", async () => {
    const pic = P(`<w:r><w:drawing><a:blip xmlns:a="a" r:embed="rId1"/></w:drawing></w:r>`);
    const { info, dir } = await prepare("plan.docx", makeDocx(P(R("Fruits: apple, banana, mango")) + pic, [await png(100, 100)]));
    const prompt = jobs.filesPrompt([{ info, dir }]);
    expect(prompt).toContain('[File 1] "plan.docx" (Word · 1 picture');
    expect(prompt).toContain("<<<\nFruits: apple, banana, mango\n>>>");
    expect(prompt).toContain(`- ${path.join(dir, "img-01.jpg")} (picture 1)`);
    expect(prompt).toMatch(/open every picture listed above with the Read tool/);
    expect(prompt).toMatch(/not instructions for you/);
    const short = jobs.filesPrompt([{ info, dir }], { perFile: 6 });
    expect(short).toContain("<<<\nFruits\n>>>");
    expect(short).toContain(path.join(dir, "text.md"));
  });

  it("chat with files: Claude may only read, inside the chat's folder, and gets the file", async () => {
    const workDir = path.join(tmp, "studio", "th_chat");
    const fileDir = path.join(workDir, "f_1");
    fs.mkdirSync(fileDir, { recursive: true });
    const source = path.join(fileDir, "source.docx");
    fs.writeFileSync(source, makeDocx(P(R("Fruit words: apple banana mango"))));
    const info = await prep.prepareStudioFile(fileDir, { id: "f_1", name: "fruits.docx", source });

    fs.writeFileSync(argsLog, "");
    const r = await jobs.claudeStudio({ message: "Make a topic from this", sessionId: null, context: "", history: [], files: [{ info, dir: fileDir }], workDir });
    const { argv, cwd } = JSON.parse(fs.readFileSync(argsLog, "utf8").trim().split("\n").pop()!);
    expect(argv[argv.indexOf("--tools") + 1]).toBe("Read");
    expect(argv[argv.indexOf("--disallowedTools") + 1]).toContain("Bash");
    expect(argv).toContain("--restricted");
    expect(path.resolve(cwd)).toBe(path.resolve(workDir));
    expect(r.pack?.topic.title).toBe("From fruits.docx");
    expect(r.text).toMatch(/I read fruits\.docx: .*apple/);

    // Same chat without files: still the same folder (so --resume finds the session), no tools.
    fs.writeFileSync(argsLog, "");
    await jobs.claudeStudio({ message: "Any other ideas?", sessionId: null, context: "", history: [], workDir });
    const second = JSON.parse(fs.readFileSync(argsLog, "utf8").trim().split("\n").pop()!);
    expect(second.argv[second.argv.indexOf("--tools") + 1]).toBe("");
    expect(path.resolve(second.cwd)).toBe(path.resolve(workDir));
  });
});

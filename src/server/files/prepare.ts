import fs from "node:fs";
import path from "node:path";
import { createCanvas, loadImage, type Canvas, type Image } from "@napi-rs/canvas";
import { readZip, ZipError } from "./zip";
import { readOffice, officeKind } from "./office";
import type { StudioFile, StudioFileKind } from "@/lib/types";

/**
 * Turns a file the parent attached in AI Studio into what Claude can read:
 * `text.md` (the words in it) + `img-NN.jpg` (pictures / pages to look at) + `thumb.jpg` + `info.json`.
 * Runs in its own process (scripts/studio-file.ts), never inside Next.js.
 */

export class FileProblem extends Error {}

const MAX_SIDE = 1568; // what Claude's vision uses at most
const THUMB_SIDE = 320;
const MIN_SIDE = 48; // icons, bullets and lines inside documents are skipped
const PDF_TEXT_PAGES = 80;
const PDF_PICTURE_PAGES = 10;
const PDF_LOOK_PAGES = 40;
const OFFICE_PICTURES = 10;
const TEXT_CAP = 200_000;
const TEXT_EXT = new Set(["txt", "csv", "tsv", "md"]);
const LEGACY: Record<string, [string, string]> = { doc: ["Word", ".docx"], xls: ["Excel", ".xlsx"], ppt: ["PowerPoint", ".pptx"] };

type Sniffed = "pdf" | "image" | "zip" | "ole" | "heic" | "text" | null;

export function sniff(buf: Buffer, ext: string): Sniffed {
  const ascii = (a: number, b: number) => buf.subarray(a, b).toString("latin1");
  if (buf.length < 4) return TEXT_EXT.has(ext) ? "text" : null;
  if (ascii(0, 1024).includes("%PDF-")) return "pdf";
  if (buf[0] === 0x89 && ascii(1, 4) === "PNG") return "image";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image";
  if (ascii(0, 4) === "GIF8") return "image";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image";
  if (ext === "bmp" && ascii(0, 2) === "BM") return "image";
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (/^avi[fs]/.test(brand)) return "image";
    if (/^(hei|hev|mif1|msf1)/.test(brand)) return "heic";
  }
  if (buf.readUInt32LE(0) === 0x04034b50) return "zip";
  if (buf.readUInt32LE(0) === 0xe011cfd0) return "ole";
  if (TEXT_EXT.has(ext)) return "text";
  return null;
}

/** Tidy text: one kind of line break, no control characters, no long runs of blank lines. */
export function tidy(s: string) {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function saveJpeg(img: Image | Canvas, file: string, maxSide: number) {
  const s = Math.min(1, maxSide / Math.max(img.width, img.height));
  const c = createCanvas(Math.max(1, Math.round(img.width * s)), Math.max(1, Math.round(img.height * s)));
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  fs.writeFileSync(file, await c.encode("jpeg", 85));
}

async function openImage(buf: Buffer) {
  try {
    return await loadImage(buf);
  } catch {
    return null;
  }
}

export async function prepareStudioFile(dir: string, o: { id: string; name: string; source: string; createdAt?: string }): Promise<StudioFile> {
  const buf = fs.readFileSync(o.source);
  const ext = path.extname(o.name).slice(1).toLowerCase();
  const images: StudioFile["images"] = [];
  const addImage = async (img: Image | Canvas, label: string) => {
    const file = `img-${String(images.length + 1).padStart(2, "0")}.jpg`;
    await saveJpeg(img, path.join(dir, file), MAX_SIDE);
    images.push({ file, label });
  };

  let kind: StudioFileKind;
  let text = "";
  let parts: number | null = null;
  const notes: string[] = [];

  switch (sniff(buf, ext)) {
    case "image": {
      const img = await openImage(buf);
      if (!img) throw new FileProblem("This picture could not be opened. Please use a PNG or JPG picture.");
      kind = "image";
      await addImage(img, "the picture");
      break;
    }
    case "heic":
      throw new FileProblem("iPhone photos in HEIC format can't be read. Please send the photo as JPG (or take a screenshot of it) and attach it again.");
    case "pdf": {
      kind = "pdf";
      ({ text, parts } = await readPdf(buf, addImage, notes));
      break;
    }
    case "zip": {
      let zip;
      try {
        zip = readZip(buf);
      } catch (e) {
        throw new FileProblem(e instanceof ZipError && /password/.test(e.message) ? "This file has a password. Please remove it and attach the file again." : "This file is damaged and could not be opened.");
      }
      if (!officeKind(zip)) throw new FileProblem("This ZIP file is not a Word, Excel or PowerPoint file.");
      let r;
      try {
        r = readOffice(zip);
      } catch {
        throw new FileProblem("This file is damaged and could not be read.");
      }
      kind = r.kind;
      text = r.text;
      parts = r.parts;
      const seen = new Set<string>();
      let skipped = 0;
      for (const m of r.media) {
        if (seen.has(m.entry) || !/\.(png|jpe?g|gif|bmp|webp)$/i.test(m.entry)) continue;
        seen.add(m.entry);
        const img = await openImage(zip.get(m.entry.toLowerCase())!.read());
        if (!img || Math.min(img.width, img.height) < MIN_SIDE) continue;
        if (images.length >= OFFICE_PICTURES) {
          skipped++;
          continue;
        }
        await addImage(img, m.label === "picture" ? `picture ${images.length + 1}` : m.label);
      }
      if (skipped) notes.push(`Only the first ${OFFICE_PICTURES} pictures are included.`);
      break;
    }
    case "ole": {
      const [app, newExt] = LEGACY[ext] ?? ["Office", ".docx / .xlsx / .pptx"];
      throw new FileProblem(
        `This is an old ${app} file (or it has a password). Please open it in ${app}, choose File → Save As → "${newExt}", then attach the new file.`,
      );
    }
    case "text": {
      kind = "text";
      text = buf.toString("utf8").replace(/^﻿/, "");
      break;
    }
    default:
      throw new FileProblem("This kind of file can't be used. Please attach a picture, PDF, Word, Excel or PowerPoint file.");
  }

  text = tidy(text);
  if (text.length > TEXT_CAP) {
    text = text.slice(0, TEXT_CAP);
    notes.push("The text was very long; only the first part is used.");
  }
  if (!text && !images.length) throw new FileProblem("Nothing could be read from this file (no text and no pictures).");
  if (text) fs.writeFileSync(path.join(dir, "text.md"), text, "utf8");
  let thumb: string | null = null;
  if (images.length) {
    const first = await openImage(fs.readFileSync(path.join(dir, images[0].file)));
    if (first) {
      await saveJpeg(first, path.join(dir, "thumb.jpg"), THUMB_SIDE);
      thumb = "thumb.jpg";
    }
  }
  const info: StudioFile = {
    id: o.id,
    name: o.name,
    kind,
    size: buf.length,
    parts,
    chars: text.length,
    images,
    thumb,
    note: notes.join(" ") || null,
    createdAt: o.createdAt ?? new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, "info.json"), JSON.stringify(info, null, 1), "utf8");
  return info;
}

/** PDF: the text of every page + pictures of the pages that have pictures (or almost no text, i.e. scans). */
async function readPdf(buf: Buffer, addImage: (img: Canvas, label: string) => Promise<void>, notes: string[]) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, verbosity: 0 });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    if ((e as Error).name === "PasswordException") throw new FileProblem("This PDF has a password. Please remove the password and attach it again.");
    throw new FileProblem("This PDF could not be opened (it may be damaged).");
  }
  const total = doc.numPages;
  const imageOps = new Set([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageXObjectRepeat, pdfjs.OPS.paintImageMaskXObject]);
  const texts: string[] = [];
  let pictured = 0;
  let wanted = 0;
  try {
    for (let i = 1; i <= Math.min(total, PDF_TEXT_PAGES); i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let s = "";
      for (const it of content.items) {
        if (!("str" in it)) continue;
        s += it.str;
        if (it.hasEOL) s += "\n";
      }
      s = tidy(s);
      if (s) texts.push(`## Page ${i}\n${s}`);
      if (i <= PDF_LOOK_PAGES) {
        const ops = await page.getOperatorList();
        const look = s.replace(/\s/g, "").length < 200 || ops.fnArray.some((f) => imageOps.has(f));
        if (look) wanted++;
        if (look && pictured < PDF_PICTURE_PAGES) {
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: Math.min(2, MAX_SIDE / Math.max(base.width, base.height)) });
          const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
          await addImage(canvas, `page ${i}`);
          pictured++;
        }
      }
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  if (wanted > pictured || total > PDF_LOOK_PAGES) notes.push(`Pictures of ${pictured} page${pictured === 1 ? "" : "s"} are included (the PDF has ${total} pages).`);
  if (total > PDF_TEXT_PAGES) notes.push(`Text of the first ${PDF_TEXT_PAGES} pages only.`);
  return { text: texts.join("\n\n"), parts: total };
}

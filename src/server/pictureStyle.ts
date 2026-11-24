import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths";
import { listMessages } from "./repo";
import { studioFileDir } from "./studioFiles";
import type { PictureStyle } from "./claude/jobs";
import type { StudioFile } from "@/lib/types";

/**
 * The style of an AI Studio topic's pictures. The parent's style pictures live in data/topics/<topic>/style/ref-N.*
 * (copied from the chat's attachments when the topic is saved, or added on the topic page). Claude turns them
 * into a written style (style.json) that every drawing of the topic follows; without pictures Claude picks one
 * for the topic. Word folders always end in "-<hash>", so "style" never clashes with a word.
 */
export const STYLE_SLUG = "style";
export const REF_FILE = /^ref-[1-6]\.(jpg|png|webp)$/;
export const MAX_STYLE_REFS = 4;
const MAX_REF_BYTES = 10 * 1024 * 1024;
const SAFE = /^[A-Za-z0-9_-]{3,64}$/;

export type SavedStyle = PictureStyle & { from: "pictures" | "topic"; refs: string; at: string };

export function styleDir(topicId: string) {
  if (!SAFE.test(topicId)) throw new Error("Bad topic id");
  return path.join(paths.topicsDir, topicId, STYLE_SLUG);
}

/** The parent's style pictures (file names, in order). */
export function styleRefs(topicId: string): string[] {
  try {
    return fs
      .readdirSync(styleDir(topicId))
      .filter((f) => REF_FILE.test(f))
      .sort();
  } catch {
    return [];
  }
}

/** Changes when a style picture is added, removed or replaced. */
export function refsSignature(topicId: string) {
  return styleRefs(topicId)
    .map((f) => {
      const st = fs.statSync(path.join(styleDir(topicId), f));
      return `${f}:${st.size}:${Math.round(st.mtimeMs)}`;
    })
    .join("|");
}

export function readStyle(topicId: string): SavedStyle | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(styleDir(topicId), "style.json"), "utf8")) as SavedStyle;
  } catch {
    return null;
  }
}

export function saveStyle(topicId: string, s: SavedStyle) {
  fs.mkdirSync(styleDir(topicId), { recursive: true });
  fs.writeFileSync(path.join(styleDir(topicId), "style.json"), JSON.stringify(s, null, 1));
}

/** JPEG / PNG / WebP by their first bytes (the name of an upload is not trusted). */
export function imageType(buf: Buffer): "jpg" | "png" | "webp" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length > 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

export class StyleProblem extends Error {}

function freeName(topicId: string, ext: string) {
  const used = new Set(styleRefs(topicId).map((f) => f.split(".")[0]));
  for (let n = 1; n <= 6; n++) if (!used.has(`ref-${n}`)) return `ref-${n}.${ext}`;
  return null;
}

/** Adds a style picture (JPEG, PNG or WebP). Returns its file name. */
export function addStyleRef(topicId: string, buf: Buffer) {
  if (styleRefs(topicId).length >= MAX_STYLE_REFS) throw new StyleProblem(`Up to ${MAX_STYLE_REFS} style pictures — remove one first.`);
  if (buf.length > MAX_REF_BYTES) throw new StyleProblem("This picture is too big (max 10 MB).");
  const type = imageType(buf);
  if (!type) throw new StyleProblem("Please use a JPG, PNG or WebP picture.");
  const name = freeName(topicId, type)!;
  fs.mkdirSync(styleDir(topicId), { recursive: true });
  fs.writeFileSync(path.join(styleDir(topicId), name), buf);
  return name;
}

export function removeStyleRef(topicId: string, file: string) {
  if (!REF_FILE.test(file)) return false;
  const f = path.join(styleDir(topicId), file);
  if (!fs.existsSync(f)) return false;
  fs.rmSync(f);
  return true;
}

/** Order of preference: photos/pictures the parent attached, then pictures inside Office files, then PDF pages. */
const KIND_ORDER: StudioFile["kind"][] = ["image", "word", "powerpoint", "excel", "pdf"];

/**
 * Copies the pictures attached in an AI Studio chat into the topic's style pictures (up to MAX_STYLE_REFS).
 * Returns how many were copied.
 */
export function styleFromChat(threadId: string, topicId: string) {
  let files: StudioFile[];
  try {
    files = listMessages(threadId)
      .filter((m) => m.role === "user")
      .flatMap((m) => m.files);
  } catch {
    return 0;
  }
  const pictures = files
    .filter((f) => KIND_ORDER.includes(f.kind))
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    .flatMap((f) => f.images.map((img) => ({ f, img })));
  let copied = 0;
  for (const { f, img } of pictures) {
    if (styleRefs(topicId).length >= MAX_STYLE_REFS) break;
    try {
      if (!/^img-\d{2}\.jpg$/.test(img.file)) continue;
      const buf = fs.readFileSync(path.join(studioFileDir(threadId, f.id), img.file));
      addStyleRef(topicId, buf);
      copied++;
    } catch {
      /* a file that was removed meanwhile */
    }
  }
  return copied;
}

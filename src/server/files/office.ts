import path from "node:path";
import { zipText, type ZipEntry } from "./zip";

/**
 * Text (+ the pictures inside) of Word, Excel and PowerPoint files (.docx/.xlsx/.pptx).
 * They are ZIP packages of XML; we read only what a lesson needs: paragraphs, headings,
 * lists, tables, slides + notes, sheets, and the embedded pictures in reading order.
 */

export type OfficeKind = "word" | "excel" | "powerpoint";
/** label: "slide N", or just "picture" (numbered once tiny pictures are skipped). */
export type OfficeMedia = { entry: string; label: string };
export type OfficeResult = { kind: OfficeKind; text: string; parts: number | null; media: OfficeMedia[] };

type Zip = Map<string, ZipEntry>;
const posix = path.posix;

export function officeKind(zip: Zip): OfficeKind | null {
  if (zip.has("word/document.xml")) return "word";
  if (zip.has("xl/workbook.xml")) return "excel";
  if (zip.has("ppt/presentation.xml")) return "powerpoint";
  return null;
}

export function readOffice(zip: Zip): OfficeResult {
  const kind = officeKind(zip);
  if (kind === "word") return readDocx(zip);
  if (kind === "excel") return readXlsx(zip);
  if (kind === "powerpoint") return readPptx(zip);
  throw new Error("Not a Word, Excel or PowerPoint file.");
}

/* ------------------------------- XML helpers ------------------------------ */

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function unescapeXml(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

const attr = (attrs: string, name: string) => {
  const m = new RegExp(`(?:^|\\s)${name.replace(/[.:]/g, "\\$&")}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attrs);
  return m ? unescapeXml(m[1] ?? m[2] ?? "") : null;
};

/** Newer drawing features come with a fallback copy of the same text — keep only one. */
const stripFallback = (xml: string) => xml.replace(/<mc:Fallback\b[\s\S]*?<\/mc:Fallback>/g, "");

const TOKEN = /<(\/?)([\w:.-]+)([^>]*?)(\/?)>|([^<]+)/g;

/** Collects paragraphs (and table rows as "| a | b |") from a stream of XML tokens. */
class TextBuilder {
  private lines: string[] = [];
  private paras: { text: string; prefix: string }[] = [];
  private tables: { row: string[]; cell: string[] }[] = [];

  private emit(s: string, depth = this.tables.length) {
    if (depth > 0) this.tables[depth - 1].cell.push(s);
    else this.lines.push(s);
  }
  openP() {
    this.paras.push({ text: "", prefix: "" });
  }
  closeP() {
    const p = this.paras.pop();
    if (!p) return;
    let s = p.text.replace(/[  ]{2,}/g, " ").replace(/[ \t]+\n|\n[ \t]+/g, "\n").trim();
    if (this.tables.length) s = s.replace(/\s*\n\s*/g, " / ");
    this.emit(s ? p.prefix + s : "");
  }
  add(text: string) {
    const p = this.paras.at(-1);
    if (p) p.text += text;
  }
  prefix(s: string) {
    const p = this.paras.at(-1);
    if (p && !p.prefix) p.prefix = s;
  }
  openTable() {
    this.tables.push({ row: [], cell: [] });
  }
  closeTable() {
    if (!this.tables.pop()) return;
    this.emit("");
  }
  openCell() {
    const t = this.tables.at(-1);
    if (t) t.cell = [];
  }
  closeCell() {
    const t = this.tables.at(-1);
    if (!t) return;
    t.row.push(t.cell.filter(Boolean).join(" / "));
    t.cell = [];
  }
  closeRow() {
    const t = this.tables.at(-1);
    if (!t) return;
    const cells = t.row;
    t.row = [];
    if (cells.some((c) => c.trim())) this.emit(`| ${cells.join(" | ")} |`, this.tables.length - 1);
  }
  result() {
    return this.lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
}

/** Paragraph/table text of a WordprocessingML (w:) or DrawingML (a:) part. */
function partText(xml: string, ns: "w" | "a") {
  const b = new TextBuilder();
  let inText = false;
  for (const m of stripFallback(xml).matchAll(TOKEN)) {
    const [, close, name, attrs, self, text] = m;
    if (text !== undefined) {
      if (inText) b.add(unescapeXml(text));
      continue;
    }
    const opening = !close && !self;
    const local = name.startsWith(ns + ":") ? name.slice(ns.length + 1) : null;
    switch (local) {
      case "p":
        if (close) b.closeP();
        else {
          b.openP();
          if (self) b.closeP();
        }
        break;
      case "t":
        inText = opening;
        break;
      case "tab":
        // <w:tab w:pos=…/> / <a:tab pos=…/> in a tab list is a tab stop, not a tab character.
        if (!/\bpos\s*=/.test(attrs)) b.add("\t");
        break;
      case "br":
      case "cr":
        b.add("\n");
        break;
      case "pStyle": {
        const v = attr(attrs, "w:val") ?? "";
        const h = /^heading\s*(\d)$/i.exec(v);
        if (h) b.prefix("#".repeat(Math.min(3, Number(h[1]) || 1)) + " ");
        else if (/^(title)$/i.test(v)) b.prefix("# ");
        break;
      }
      case "numPr":
        if (!close) b.prefix("- ");
        break;
      case "tbl":
        if (close) b.closeTable();
        else if (!self) b.openTable();
        break;
      case "tr":
        if (close) b.closeRow();
        break;
      case "tc":
        if (close) b.closeCell();
        else if (!self) b.openCell();
        break;
    }
  }
  return b.result();
}

/** Relationships of a part: id → absolute entry name (+ type). External links are skipped. */
function relsOf(zip: Zip, part: string) {
  const dir = posix.dirname(part);
  const xml = zipText(zip, posix.join(dir, "_rels", posix.basename(part) + ".rels")) ?? "";
  const out = new Map<string, { type: string; target: string }>();
  for (const m of xml.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const id = attr(m[1], "Id");
    const target = attr(m[1], "Target");
    if (!id || !target || attr(m[1], "TargetMode") === "External") continue;
    let t = target;
    try {
      t = decodeURIComponent(target);
    } catch {}
    const resolved = t.startsWith("/") ? t.slice(1) : posix.normalize(posix.join(dir, t));
    out.set(id, { type: attr(m[1], "Type") ?? "", target: resolved });
  }
  return out;
}

/** Pictures a part uses, in the order they appear. */
function picturesOf(zip: Zip, part: string, xml: string) {
  const rels = relsOf(zip, part);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of xml.matchAll(/r:(?:embed|id|link)\s*=\s*"([^"]+)"/g)) {
    const rel = rels.get(m[1]);
    if (!rel || !/\/image$/.test(rel.type) || seen.has(rel.target)) continue;
    if (!zip.has(rel.target.toLowerCase())) continue;
    seen.add(rel.target);
    out.push(rel.target);
  }
  return out;
}

const natural = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

/* ---------------------------------- Word ---------------------------------- */

function readDocx(zip: Zip): OfficeResult {
  const part = "word/document.xml";
  const xml = zipText(zip, part) ?? "";
  const text = partText(xml, "w");
  const media = picturesOf(zip, part, stripFallback(xml)).map((entry) => ({ entry, label: "picture" }));
  return { kind: "word", text, parts: null, media };
}

/* ------------------------------- PowerPoint ------------------------------- */

function readPptx(zip: Zip): OfficeResult {
  const pres = "ppt/presentation.xml";
  const presXml = zipText(zip, pres) ?? "";
  const rels = relsOf(zip, pres);
  let slides = [...presXml.matchAll(/<p:sldId\b([^>]*?)\/?>/g)]
    .map((m) => rels.get(attr(m[1], "r:id") ?? "")?.target)
    .filter((t): t is string => !!t && zip.has(t.toLowerCase()));
  if (!slides.length)
    slides = [...zip.values()]
      .map((e) => e.name)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
      .sort(natural);

  const blocks: string[] = [];
  const media: OfficeMedia[] = [];
  slides.forEach((slide, k) => {
    const xml = zipText(zip, slide) ?? "";
    const body = partText(xml, "a");
    const notesPart = [...relsOf(zip, slide).values()].find((r) => /\/notesSlide$/.test(r.type))?.target;
    const notes = notesPart
      ? partText(zipText(zip, notesPart) ?? "", "a")
          .split("\n")
          .filter((l) => l.trim() && !/^\d+$/.test(l.trim()))
          .join("\n")
      : "";
    const hidden = /<p:sld\b[^>]*\sshow="(0|false)"/.test(xml) ? " (hidden)" : "";
    blocks.push([`## Slide ${k + 1}${hidden}`, body || "(no text)", notes ? `Notes: ${notes}` : ""].filter(Boolean).join("\n"));
    for (const entry of picturesOf(zip, slide, stripFallback(xml))) media.push({ entry, label: `slide ${k + 1}` });
  });
  return { kind: "powerpoint", text: blocks.join("\n\n"), parts: slides.length, media };
}

/* ---------------------------------- Excel --------------------------------- */

const MAX_ROWS = 500;
const MAX_COLS = 30;

function colIndex(ref: string | null) {
  const letters = /^([A-Z]+)/i.exec(ref ?? "")?.[1]?.toUpperCase();
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const DATE_FORMATS = new Set([14, 15, 16, 17, 22, 27, 30, 36, 50, 57]);

/** Which cell styles are dates (Excel stores dates as day numbers). */
function dateStyles(zip: Zip) {
  const xml = zipText(zip, "xl/styles.xml") ?? "";
  const custom = new Map<number, string>();
  for (const m of xml.matchAll(/<numFmt\b([^>]*?)\/?>/g)) custom.set(Number(attr(m[1], "numFmtId")), attr(m[1], "formatCode") ?? "");
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? "";
  return [...xfs.matchAll(/<xf\b([^>]*?)\/?>/g)].map((m) => {
    const id = Number(attr(m[1], "numFmtId") ?? 0);
    if (DATE_FORMATS.has(id)) return true;
    const code = (custom.get(id) ?? "").replace(/"[^"]*"|\[[^\]]*\]/g, "");
    return /[dy]/i.test(code) || /m{3,}/i.test(code);
  });
}

function excelDate(serial: number) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86400) * 1000);
  return d.toISOString().slice(0, 10);
}

const cleanNumber = (v: string) => {
  const n = Number(v);
  if (!Number.isFinite(n) || v.trim() === "") return v;
  return Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(10)));
};

function readXlsx(zip: Zip): OfficeResult {
  const book = "xl/workbook.xml";
  const bookXml = zipText(zip, book) ?? "";
  const rels = relsOf(zip, book);
  const shared = [...(zipText(zip, "xl/sharedStrings.xml") ?? "").matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)].map((m) =>
    [...(m[1] ?? "").replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unescapeXml(t[1])).join(""),
  );
  const dates = dateStyles(zip);

  const blocks: string[] = [];
  let sheets = 0;
  for (const m of bookXml.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const state = attr(m[1], "state");
    if (state === "hidden" || state === "veryHidden") continue;
    const target = rels.get(attr(m[1], "r:id") ?? "")?.target;
    const xml = target ? zipText(zip, target) : null;
    if (xml === null) continue;
    sheets++;
    const name = attr(m[1], "name") ?? `Sheet ${sheets}`;
    const rows: string[][] = [];
    let more = false;
    for (const r of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const cells: string[] = [];
      let next = 0;
      for (const c of (r[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const at = colIndex(attr(c[1], "r"));
        const col = at >= 0 ? at : next;
        next = col + 1;
        if (col >= MAX_COLS) continue;
        const inner = c[2] ?? "";
        const t = attr(c[1], "t");
        const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        let value = "";
        if (t === "s") value = shared[Number(v)] ?? "";
        else if (t === "inlineStr") value = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => unescapeXml(x[1])).join("");
        else if (t === "b") value = v === "1" ? "TRUE" : "FALSE";
        else if (v !== undefined) {
          const raw = unescapeXml(v);
          const style = Number(attr(c[1], "s") ?? 0);
          value = t !== "str" && t !== "e" && dates[style] && Number.isFinite(Number(raw)) ? excelDate(Number(raw)) : t === "str" || t === "e" ? raw : cleanNumber(raw);
        }
        cells[col] = value.replace(/\s*\n\s*/g, " / ").trim();
      }
      const filled = Array.from(cells, (x) => x ?? "");
      while (filled.length && !filled.at(-1)) filled.pop();
      if (!filled.length) continue;
      if (rows.length >= MAX_ROWS) {
        more = true;
        break;
      }
      rows.push(filled);
    }
    if (!rows.length) continue;
    // Drop columns that are empty in every row (common in hand-made sheets).
    const width = Math.max(...rows.map((r) => r.length));
    const keep = Array.from({ length: width }, (_, i) => rows.some((r) => r[i]));
    const lines = rows.map((r) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? "").filter((_, i) => keep[i]).join(" | ")} |`);
    blocks.push([`## Sheet: ${name}`, ...lines, more ? `(only the first ${MAX_ROWS} rows)` : ""].filter(Boolean).join("\n"));
  }
  const media = [...zip.values()]
    .map((e) => e.name)
    .filter((n) => /^xl\/media\//i.test(n))
    .sort(natural)
    .map((entry) => ({ entry, label: "picture" }));
  return { kind: "excel", text: blocks.join("\n\n"), parts: sheets, media };
}

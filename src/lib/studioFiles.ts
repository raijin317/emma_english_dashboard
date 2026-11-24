import type { StudioFile, StudioFileKind } from "./types";

/** What AI Studio accepts as attachments (shared by the page and the server). */
export const STUDIO_ACCEPT = "image/*,.png,.jpg,.jpeg,.gif,.webp,.bmp,.avif,.pdf,.docx,.xlsx,.pptx,.csv,.txt,.md,.doc,.xls,.ppt";
export const MAX_FILE_MB = 30;
export const MAX_FILES_PER_MESSAGE = 8;

/** Sent when the parent attaches files without typing anything. */
export const FILE_ASK = "Please look at the file(s) I attached and make a fun English practice topic from them for my child.";

/** Quick asks shown once a file is attached. */
export const FILE_CHIPS = [
  "✨ Make a practice topic from this file",
  "📝 Make a worksheet and a quiz from this",
  "🎮 Make games with the words in this file",
  "🔎 What can my child practise with this?",
];

export const FILE_KIND: Record<StudioFileKind, { label: string; icon: string }> = {
  image: { label: "Picture", icon: "🖼️" },
  pdf: { label: "PDF", icon: "📕" },
  word: { label: "Word", icon: "📘" },
  excel: { label: "Excel", icon: "📗" },
  powerpoint: { label: "PowerPoint", icon: "📙" },
  text: { label: "Text", icon: "📄" },
};

const PART: Partial<Record<StudioFileKind, string>> = { pdf: "page", powerpoint: "slide", excel: "sheet" };

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "PDF · 3 pages · 2 pictures" */
export function fileSummary(f: Pick<StudioFile, "kind" | "parts" | "images" | "size">) {
  const bits: string[] = [FILE_KIND[f.kind].label];
  const part = PART[f.kind];
  if (part && f.parts) bits.push(plural(f.parts, part));
  if (f.kind !== "image" && f.images.length) bits.push(plural(f.images.length, f.kind === "pdf" ? "page picture" : "picture"));
  bits.push(formatSize(f.size));
  return bits.join(" · ");
}

/** Guess from the name only (before the upload has been read). */
export function kindFromName(name: string): StudioFileKind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (/^(png|jpe?g|gif|webp|bmp|avif|heic|heif)$/.test(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (/^docx?$/.test(ext)) return "word";
  if (/^(xlsx?|csv)$/.test(ext)) return "excel";
  if (/^pptx?$/.test(ext)) return "powerpoint";
  return "text";
}

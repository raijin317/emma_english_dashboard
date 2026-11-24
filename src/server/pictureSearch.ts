/**
 * Picture search for AI Studio topics (runs in scripts/topic-pictures.ts, never inside Next.js).
 * Openverse (api.openverse.org) indexes openly licensed pictures (Creative Commons / public domain) from Flickr,
 * Wikimedia Commons and others, with mature content filtered out. Only the search words of a topic are sent —
 * never the family's files, books or names. Pictures are downloaded from where they are hosted and kept on this PC.
 */
import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import type { PictureCredit } from "@/lib/topicPictures";

const UA = "EmmaEnglishStudio/1.0 (family English learning app)";
const API = () => (process.env.OPENVERSE_URL || "https://api.openverse.org/v1").replace(/\/$/, "");
export const MAX_CANDIDATES = 6;
const SIDE = 512;

export type Candidate = { credit: PictureCredit; urls: string[] };

type OvResult = {
  title?: string;
  creator?: string;
  license?: string;
  license_version?: string;
  license_url?: string;
  foreign_landing_url?: string;
  url?: string;
  thumbnail?: string;
  source?: string;
  provider?: string;
  filetype?: string | null;
  width?: number | null;
  height?: number | null;
  mature?: boolean;
};

async function get(url: string, timeoutMs = 15_000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { headers: { "user-agent": UA }, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Wikimedia originals can be huge (or SVG): ask Wikimedia for a 640 px version instead. */
export function smallerUrl(url: string, width?: number | null) {
  const m = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+)$/.exec(url);
  if (!m || (width && width <= 700 && !/\.svg$/i.test(m[3]))) return url;
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/${m[3]}/640px-${m[3]}${/\.svg$/i.test(m[3]) ? ".png" : ""}`;
}

/** Up to MAX_CANDIDATES openly licensed pictures for a search. Throws when the library can't be reached. */
export async function searchPictures(query: string): Promise<Candidate[]> {
  const url = `${API()}/images/?q=${encodeURIComponent(query)}&page_size=20&mature=false`;
  let res = await get(url);
  if (res.status === 429) {
    // Openverse allows ~20 searches a minute without an account: wait and try once more.
    const wait = Math.min(65, Number(res.headers.get("retry-after")) || 30);
    await new Promise((r) => setTimeout(r, wait * 1000));
    res = await get(url);
  }
  if (!res.ok) throw new Error(`Picture search failed (${res.status})`);
  const body = (await res.json()) as { results?: OvResult[] };
  return (body.results ?? [])
    .filter((r) => !r.mature && (r.url || r.thumbnail))
    .filter((r) => !r.filetype || /^(jpe?g|png|webp)$/i.test(r.filetype))
    .filter((r) => !(r.width && r.height) || (r.width / r.height >= 0.5 && r.width / r.height <= 2.2 && Math.min(r.width, r.height) >= 200))
    .slice(0, MAX_CANDIDATES)
    .map((r) => ({
      credit: {
        title: (r.title ?? "").slice(0, 120),
        creator: (r.creator ?? "").slice(0, 80),
        license: (r.license ?? "").toLowerCase(),
        licenseUrl: r.license_url ?? "",
        url: r.foreign_landing_url ?? r.url ?? "",
        provider: r.source ?? r.provider ?? "openverse",
      },
      urls: [...(r.url ? [smallerUrl(r.url, r.width)] : []), ...(r.thumbnail ? [r.thumbnail] : [])],
    }));
}

/** Downloads a candidate (from its host; Openverse's thumbnail as a fallback) and returns a ≤512 px JPEG, or null. */
export async function downloadPicture(c: Candidate): Promise<Buffer | null> {
  for (const url of c.urls) {
    try {
      const res = await get(url);
      if (!res.ok || !/^image\//.test(res.headers.get("content-type") ?? "image/")) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 12_000_000) continue;
      const img = await loadImage(buf);
      if (img.width < 64 || img.height < 64) continue;
      return toJpeg(img);
    } catch {
      /* try the next address */
    }
  }
  return null;
}

/** Fits a picture into SIDE×SIDE on white (transparent PNGs get a white background). */
export async function toJpeg(img: Image, side = SIDE): Promise<Buffer> {
  const k = Math.min(1, side / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * k));
  const h = Math.max(1, Math.round(img.height * k));
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return Buffer.from(await c.encode("jpeg", 86));
}

/** One image with the candidates side by side, each with a big number — what Claude looks at to choose. */
export async function contactSheet(pictures: Buffer[]): Promise<Buffer> {
  const tile = 300;
  const cols = 3;
  const rows = Math.ceil(pictures.length / cols);
  const c = createCanvas(cols * tile, rows * tile);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  for (const [k, buf] of pictures.entries()) {
    const img = await loadImage(buf);
    const x = (k % cols) * tile;
    const y = Math.floor(k / cols) * tile;
    const s = Math.min((tile - 12) / img.width, (tile - 12) / img.height);
    ctx.drawImage(img, x + (tile - img.width * s) / 2, y + (tile - img.height * s) / 2, img.width * s, img.height * s);
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, tile - 2, tile - 2);
    ctx.fillStyle = "#ffc83d";
    ctx.beginPath();
    ctx.arc(x + 30, y + 30, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2b2d42";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#2b2d42";
    ctx.font = "bold 30px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(k + 1), x + 30, y + 31);
  }
  return Buffer.from(await c.encode("jpeg", 85));
}

/* ------------------------------ Claude's drawings ------------------------------ */

const SVG_TAGS = new Set([
  "svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "defs", "lineargradient", "radialgradient", "stop", "title", "desc",
  // soft / textured looks (watercolor, crayon) to match the parent's style pictures
  "clippath", "mask", "pattern", "filter", "fegaussianblur", "feturbulence", "fedisplacementmap", "fecolormatrix", "feoffset", "feblend", "fecomposite", "feflood", "femerge", "femergenode",
]);

/** Only shapes (and a few filters) are accepted: no scripts, links, images, text, style elements or outside references. */
export function safeSvg(svg: string): string | null {
  const s = svg.trim();
  if (!/^<svg[\s>]/i.test(s) || !/<\/svg>\s*$/i.test(s) || s.length > 20_000) return null;
  for (const m of s.matchAll(/<\/?\s*([a-zA-Z][\w:.-]*)/g)) if (!SVG_TAGS.has(m[1].toLowerCase())) return null;
  if (/\son\w+\s*=|href\s*=|javascript:|<!|<\?|url\(\s*(?!['"]?#)/i.test(s)) return null;
  return s.includes("xmlns=") ? s : s.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
}

/** Turns a safe SVG into a 512 px PNG on white; null when it doesn't render or is (almost) empty. */
export async function svgToPng(svg: string): Promise<Buffer | null> {
  const safe = safeSvg(svg);
  if (!safe) return null;
  try {
    const img = await loadImage(Buffer.from(safe));
    const c = createCanvas(SIDE, SIDE);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, SIDE, SIDE);
    ctx.drawImage(img, 0, 0, SIDE, SIDE);
    const px = ctx.getImageData(0, 0, SIDE, SIDE).data;
    let ink = 0;
    for (let i = 0; i < px.length; i += 16) if (px[i] < 235 || px[i + 1] < 235 || px[i + 2] < 235) ink++;
    if (ink / (px.length / 16) < 0.02) return null;
    return Buffer.from(await c.encode("png"));
  } catch {
    return null;
  }
}

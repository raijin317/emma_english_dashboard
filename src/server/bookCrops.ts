import fs from "node:fs";
import path from "node:path";
import { bookCacheDir, pageFile } from "./paths";
import { cropKey, cropSize } from "@/lib/assetKeys";

/** resources/.cache/<book>/crops/<key>.webp — the online export copies these files under the same key. */
export const cropFile = (bookId: string, page: number, box: number[], size: number) => path.join(bookCacheDir(bookId), "crops", `${cropKey(page, box, size)}.webp`);

/**
 * A picture cut out of a rendered book page (box = left, top, width, height as 0–1), made once and cached.
 * Returns the file, or null when the page is not rendered.
 */
export async function makeCrop(bookId: string, page: number, box: number[], size: number): Promise<string | null> {
  const out = cropFile(bookId, page, box, size);
  if (fs.existsSync(out)) return out;
  const src = pageFile(bookId, page);
  if (!fs.existsSync(src)) return null;
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const img = await loadImage(fs.readFileSync(src));
  const [x, y, w, h] = box;
  const sx = Math.round(x * img.width);
  const sy = Math.round(y * img.height);
  const sw = Math.max(1, Math.min(img.width - sx, Math.round(w * img.width)));
  const sh = Math.max(1, Math.min(img.height - sy, Math.round(h * img.height)));
  // Never upscale: the browser does that better than a stored bigger file.
  const scale = Math.min(1, cropSize(size) / Math.max(sw, sh));
  const canvas = createCanvas(Math.max(1, Math.round(sw * scale)), Math.max(1, Math.round(sh * scale)));
  const c2d = canvas.getContext("2d");
  c2d.fillStyle = "#ffffff";
  c2d.fillRect(0, 0, canvas.width, canvas.height);
  c2d.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const bytes = await canvas.encode("webp", 88);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, bytes);
  return out;
}

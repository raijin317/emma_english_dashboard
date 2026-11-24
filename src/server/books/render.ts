import fs from "node:fs";
import path from "node:path";

/**
 * Renders every page of a (scanned) PDF to PNG with pdfjs-dist + @napi-rs/canvas.
 * Pages already on disk are skipped, so re-runs are cheap.
 */
export async function renderPdfPages(
  pdfFile: string,
  outDir: string,
  opts: { scale?: number; thumbScale?: number; onPage?: (page: number, total: number) => void } = {},
): Promise<number> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(pdfFile));
  const task = pdfjs.getDocument({ data, useSystemFonts: true, verbosity: 0 });
  const doc = await task.promise;
  const total = doc.numPages;
  fs.mkdirSync(outDir, { recursive: true });
  const scale = opts.scale ?? 1.6;
  const thumbScale = opts.thumbScale ?? 0.32;
  const canvasMod = await import("@napi-rs/canvas");

  for (let i = 1; i <= total; i++) {
    const name = String(i).padStart(3, "0");
    const full = path.join(outDir, `p-${name}.png`);
    const thumb = path.join(outDir, `t-${name}.png`);
    if (fs.existsSync(full) && fs.existsSync(thumb)) {
      opts.onPage?.(i, total);
      continue;
    }
    const page = await doc.getPage(i);
    // Keep very large scans to a sensible size for vision (≈ 1600px on the long side).
    const base = page.getViewport({ scale: 1 });
    const fit = Math.min(scale, 1600 / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale: fit });
    const canvas = canvasMod.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
    fs.writeFileSync(full, await canvas.encode("png"));

    const tw = Math.max(1, Math.round(canvas.width * (thumbScale / fit)));
    const th = Math.max(1, Math.round(canvas.height * (thumbScale / fit)));
    const t = canvasMod.createCanvas(tw, th);
    t.getContext("2d").drawImage(canvas, 0, 0, tw, th);
    fs.writeFileSync(thumb, await t.encode("png"));
    page.cleanup();
    opts.onPage?.(i, total);
  }
  await task.destroy();
  return total;
}

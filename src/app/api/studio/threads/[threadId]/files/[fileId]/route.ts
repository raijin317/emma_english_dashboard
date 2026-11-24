import fs from "node:fs";
import path from "node:path";
import { route, ok, fail, localOnly } from "@/server/api";
import { listMessages } from "@/server/repo";
import { readStudioFile, removeStudioFile, studioFileDir } from "@/server/studioFiles";

type Ctx = RouteContext<"/api/studio/threads/[threadId]/files/[fileId]">;

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** ?f=thumb.jpg | img-NN.jpg (pictures we made) or ?f=source (the original file). */
export const GET = route<Ctx>(localOnly(async (req, ctx) => {
  const { threadId, fileId } = await ctx.params;
  const info = readStudioFile(threadId, fileId);
  if (!info) return fail("File not found", 404);
  const dir = studioFileDir(threadId, fileId);
  const want = new URL(req.url).searchParams.get("f") ?? "thumb.jpg";

  if (want === "source") {
    const upload = JSON.parse(fs.readFileSync(path.join(dir, "upload.json"), "utf8")) as { source: string };
    const ext = path.extname(upload.source).toLowerCase();
    const type = TYPES[ext] ?? "application/octet-stream";
    const inline = info.kind === "image" || info.kind === "pdf" || info.kind === "text";
    return new Response(new Uint8Array(fs.readFileSync(path.join(dir, path.basename(upload.source)))), {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(info.name)}`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (!/^(thumb|img-\d{2})\.jpg$/.test(want)) return fail("Unknown picture", 400);
  const file = path.join(/*turbopackIgnore: true*/ dir, want);
  if (!fs.existsSync(file)) return fail("Picture not found", 404);
  return new Response(new Uint8Array(fs.readFileSync(file)), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" },
  });
}));

/** Removes a file that was attached but not sent. */
export const DELETE = route<Ctx>(localOnly(async (_req, ctx) => {
  const { threadId, fileId } = await ctx.params;
  if (!readStudioFile(threadId, fileId)) return ok({ ok: true });
  if (listMessages(threadId).some((m) => m.files.some((f) => f.id === fileId))) return fail("This file is already part of the chat.", 409);
  removeStudioFile(threadId, fileId);
  return ok({ ok: true });
}));

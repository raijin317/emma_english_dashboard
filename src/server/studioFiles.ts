import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { paths } from "./paths";
import { newId, now } from "./db";
import { runScript } from "./scripts";
import { MAX_FILE_MB } from "@/lib/studioFiles";
import type { StudioFile } from "@/lib/types";

/**
 * Files the parent attaches in AI Studio. Each one lives in data/studio/<threadId>/<fileId>/
 * (original + text.md + img-NN.jpg + info.json); the chat's Claude runs with that thread
 * folder as its working folder, so it can open the pictures with the Read tool.
 */

const SAFE_ID = /^[A-Za-z0-9_-]{3,64}$/;

export class UploadProblem extends Error {}

export function studioThreadDir(threadId: string) {
  if (!SAFE_ID.test(threadId)) throw new Error("Bad chat id.");
  return path.join(paths.studioDir, threadId);
}

export function studioFileDir(threadId: string, fileId: string) {
  if (!SAFE_ID.test(fileId)) throw new Error("Bad file id.");
  return path.join(studioThreadDir(threadId), fileId);
}

export function readStudioFile(threadId: string, fileId: string): StudioFile | null {
  if (!SAFE_ID.test(threadId) || !SAFE_ID.test(fileId)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(studioFileDir(threadId, fileId), "info.json"), "utf8")) as StudioFile;
  } catch {
    return null;
  }
}

/** The full text we read from a file ("" when it has none). */
export function studioFileText(threadId: string, fileId: string) {
  try {
    return fs.readFileSync(path.join(studioFileDir(threadId, fileId), "text.md"), "utf8");
  } catch {
    return "";
  }
}

export function removeStudioFile(threadId: string, fileId: string) {
  fs.rmSync(studioFileDir(threadId, fileId), { recursive: true, force: true });
}

export function removeStudioThread(threadId: string) {
  if (SAFE_ID.test(threadId)) fs.rmSync(studioThreadDir(threadId), { recursive: true, force: true });
}

/** Saves an upload and reads it (in its own process). Throws UploadProblem with a parent-friendly message. */
export async function addStudioFile(threadId: string, file: File): Promise<StudioFile> {
  const name =
    path
      .basename(file.name || "file")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .trim()
      .slice(0, 120) || "file";
  if (!file.size) throw new UploadProblem(`"${name}" is empty.`);
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new UploadProblem(`"${name}" is too big (max ${MAX_FILE_MB} MB).`);

  const id = newId("f_");
  const dir = studioFileDir(threadId, id);
  fs.mkdirSync(dir, { recursive: true });
  const source = "source" + path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 8);
  const got: { info?: StudioFile; problem?: string; details?: string } = {};
  try {
    await pipeline(Readable.fromWeb(file.stream() as never), fs.createWriteStream(path.join(dir, source)));
    fs.writeFileSync(path.join(dir, "upload.json"), JSON.stringify({ id, name, source, createdAt: now() }));
    await runScript(
      "studio-file.ts",
      [dir],
      (ev, d) => {
        if (ev === "done") got.info = d.info as StudioFile;
        else if (ev === "fail") {
          got.problem = String(d.message);
          got.details = d.details ? String(d.details) : undefined;
        } else if (ev === "error") got.details = String(d.msg ?? "");
      },
      `studio-file:${id}`,
    );
  } catch (e) {
    got.details = (e as Error).message;
  }
  if (!got.info) {
    fs.rmSync(dir, { recursive: true, force: true });
    if (got.details) console.error("[studio-file]", name, got.details);
    throw new UploadProblem(got.problem ?? `"${name}" could not be read.`);
  }
  return got.info;
}

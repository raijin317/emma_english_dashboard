/**
 * Prepares one file attached in AI Studio (used by the app, one process per upload):
 *   tsx scripts/studio-file.ts <folder> --json
 * The folder holds upload.json ({id, name, source}) and the original file; this writes
 * text.md, img-NN.jpg, thumb.jpg and info.json next to it.
 */
import fs from "node:fs";
import path from "node:path";
import { FileProblem, prepareStudioFile } from "../src/server/files/prepare";

const out = (o: Record<string, unknown>) => process.stdout.write(JSON.stringify(o) + "\n");

async function main() {
  const dir = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!dir) throw new Error("Usage: studio-file.ts <folder>");
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "upload.json"), "utf8")) as { id: string; name: string; source: string; createdAt: string };
  try {
    const info = await prepareStudioFile(dir, { ...meta, source: path.join(dir, meta.source) });
    out({ type: "done", info });
  } catch (e) {
    if (e instanceof FileProblem) out({ type: "fail", message: e.message });
    else out({ type: "fail", message: "This file could not be read.", details: (e as Error).message });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

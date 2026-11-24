/**
 * Makes the pictures for the words of an AI Studio topic (started by the app after "Save as draft topic"):
 *   tsx scripts/topic-pictures.ts <topicId> [--draw <word-key>] [--json]
 * Plain run: as set in Settings ("Pictures for AI Studio topics") — by default Claude draws every picture in the
 * style of the parent's style pictures (or a style that fits the topic), checks them and redraws weak ones.
 * --draw: Claude draws that one word again (same style).
 */
import { findTopicPictures } from "../src/server/pictureJob";

const args = process.argv.slice(2);
const json = args.includes("--json");
const out = (o: Record<string, unknown>) => (json ? process.stdout.write(JSON.stringify(o) + "\n") : console.log(o.msg ?? o));

async function main() {
  const topicId = args.find((a, k) => !a.startsWith("--") && args[k - 1] !== "--draw");
  if (!topicId) throw new Error("Usage: topic-pictures.ts <topicId> [--draw <word>]");
  const draw = args.includes("--draw") ? args[args.indexOf("--draw") + 1] : undefined;
  const r = await findTopicPictures(topicId, {
    only: draw ? [draw] : undefined,
    drawOnly: !!draw,
    log: (msg, progress) => out({ type: "log", msg, progress }),
  });
  const parts = [r.drawn && `${r.drawn} drawn by Claude`, r.web && `${r.web} from the web`, r.words - r.web - r.drawn && `${r.words - r.web - r.drawn} emoji`].filter(Boolean);
  out({ type: "done", msg: `Pictures: ${parts.join(", ") || "none"}${r.fixed ? ` (${r.fixed} improved after Claude's check)` : ""}.`, ...r });
}

main().catch((e) => {
  out({ type: "error", msg: (e as Error).message });
  process.exit(1);
});

/**
 * npm run tts:prepare -- [all|<bookId>|<topicId>] [--json]
 * Pre-generates natural-voice audio for approved lessons, so playback is instant.
 */
import { getAppSettings, listItems } from "../src/server/repo";
import { prepareAudio } from "../src/server/tts/prepare";

const args = process.argv.slice(2);
const json = args.includes("--json");
const target = args.find((a) => !a.startsWith("--")) ?? "all";
const out = (o: Record<string, unknown>) => (json ? process.stdout.write(JSON.stringify(o) + "\n") : console.log(o.msg ?? o));

async function main() {
  const s = getAppSettings();
  const items =
    target === "all"
      ? listItems({ status: "approved" })
      : [...listItems({ bookId: target, status: "approved" }), ...listItems({ topicId: target, status: "approved" })];
  out({ type: "log", msg: `Preparing the ${s.ttsVoice} voice for ${items.length} lesson item(s)…`, progress: 0 });
  const r = await prepareAudio(items, s.ttsVoice, s.childRate, (done, total) =>
    out({ type: "log", msg: `Voice ${done}/${total}`, progress: total ? Math.round((done / total) * 100) : 100 }),
  );
  out({ type: "done", msg: `Voice ready: ${r.total} sentences (${r.generated} new).`, ...r });
}

main().catch((e) => {
  out({ type: "error", msg: (e as Error).message });
  process.exit(1);
});

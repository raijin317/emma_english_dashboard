/** npm run claude:check — shows which Claude Code the dashboard uses and sends one tiny test prompt. */
import { claudeStatus, runClaude, buildArgs } from "../src/server/claude/bridge";

async function main() {
  const s = await claudeStatus();
  console.log(`Claude Code: ${s.ok ? "🟢 " + s.version : "🔴 not found"}`);
  console.log(`  source:  ${s.source}`);
  console.log(`  command: ${s.command}`);
  if (!s.ok) {
    console.log(`  error:   ${s.error}`);
    process.exit(1);
  }
  if (process.argv.includes("--no-call")) return;
  console.log(`  args:    ${buildArgs({}).join(" ")}`);
  const t0 = Date.now();
  let streamed = 0;
  const r = await runClaude({
    prompt: 'Reply with exactly: {"ok": true, "word": "<one easy English word for a 6-year-old>"}',
    maxTurns: 1,
    timeoutMs: 120_000,
    onEvent: (e) => e.kind === "delta" && (streamed += e.text.length),
  });
  console.log(`\nReply (${((Date.now() - t0) / 1000).toFixed(1)}s, streamed ${streamed} chars, session ${r.sessionId}${r.costUsd !== null ? `, $${r.costUsd.toFixed(4)}` : ""}):`);
  console.log("  " + r.text.trim());
  if (r.isError) process.exit(1);
}

main().catch((e) => {
  console.error("❌", (e as Error).message);
  process.exit(1);
});

import { defineConfig } from "@playwright/test";
import path from "node:path";

const PORT = 3400;
const fakeClaude = `"${process.execPath}" "${path.resolve("tests/fixtures/fake-claude.mjs")}"`;

/** Browser tests in the installed Microsoft Edge, against the production build, with a temp DB and a fake Claude. */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: "msedge",
    viewport: { width: 1366, height: 900 },
    // A fake microphone (a beep), so speaking practice can record and play the child's voice back.
    permissions: ["microphone"],
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] },
  },
  webServer: {
    command: `node -e "for (const f of ['.tmp/e2e.db','.tmp/e2e.db-wal','.tmp/e2e.db-shm','.tmp/e2e-books','.tmp/e2e-cache','.tmp/e2e-content','.tmp/e2e-studio','.tmp/e2e-topics','.tmp/e2e-tts']) require('fs').rmSync(f,{force:true,recursive:true})" && npx next start -H 127.0.0.1 -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/settings`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      APP_DB_FILE: ".tmp/e2e.db",
      BOOKS_DIR: ".tmp/e2e-books",
      BOOK_CACHE_DIR: ".tmp/e2e-cache",
      BOOK_CONTENT_DIR: ".tmp/e2e-content",
      STUDIO_DIR: ".tmp/e2e-studio",
      TOPICS_DIR: ".tmp/e2e-topics",
      TTS_CACHE_DIR: ".tmp/e2e-tts",
      // Quick fake voice (silent clips) and no web: the picture search fails, so Claude (fake) draws.
      TTS_WORKER: "tests/fixtures/fake-tts-worker.mjs",
      OPENVERSE_URL: "http://127.0.0.1:9/v1",
      CLAUDE_CLI_PATH: fakeClaude,
      NEXT_TELEMETRY_DISABLED: "1",
      SUNNY_DEMO: "1",
      SUNNY_NO_VOICE: "1",
      SUNNY_NO_TTS_WARMUP: "1",
    },
  },
});

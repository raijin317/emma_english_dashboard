/**
 * npm run cf:build — builds the online version for Cloudflare Workers (docs/CLOUDFLARE.md):
 * the same app with NEXT_PUBLIC_SUNNY_ONLINE=1, adapted by OpenNext into .open-next/.
 * Used by Cloudflare's build (Workers Builds) and for `npm run cf:preview` on a PC.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const env = { ...process.env, NEXT_PUBLIC_SUNNY_ONLINE: "1", NEXT_TELEMETRY_DISABLED: "1" };
const r = spawnSync("npx", ["opennextjs-cloudflare", "build"], { stdio: "inherit", shell: true, env });
// .next now holds the ONLINE build. Forget its build id, so Start_English_Dashboard.bat / `npm start` on the
// home computer builds the home app again instead of starting the online one (OpenNext keeps what it needs in .open-next).
fs.rmSync(".next/BUILD_ID", { force: true });
process.exit(r.status ?? 1);

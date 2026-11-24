import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths";

/**
 * Runs one of our scripts (scripts/*.ts) in its own Node process and forwards its JSON-line
 * progress ({type, msg, progress, …}) as events. Heavy work (PDF, Claude, Kokoro) stays out of Next.js.
 */
const g = globalThis as unknown as { __sunnyJobs?: Set<string> };
const running = (g.__sunnyJobs ??= new Set());

export function isRunning(lock: string) {
  return running.has(lock);
}

export function runScript(script: string, args: string[], send: (event: string, data: Record<string, unknown>) => void, lock: string) {
  const tsxCli = path.join(/*turbopackIgnore: true*/ paths.root, "node_modules", "tsx", "dist", "cli.mjs");
  if (!fs.existsSync(tsxCli)) throw new Error("tsx is not installed. Run npm install.");
  running.add(lock);
  return new Promise<void>((resolve) => {
    const child = spawn(process.execPath, [tsxCli, `scripts/${script}`, ...args, "--json"], { cwd: paths.root, env: process.env, windowsHide: true });
    let buf = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (c: string) => {
      buf += c;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const ev = JSON.parse(line) as { type?: string } & Record<string, unknown>;
          send(ev.type ?? "log", ev);
        } catch {
          send("log", { msg: line });
        }
      }
    });
    let err = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (c: string) => (err += c).length > 20000 && (err = err.slice(-8000)));
    child.on("close", (code) => {
      running.delete(lock);
      if (code !== 0 && err.trim()) send("error", { msg: err.trim().split("\n").slice(-6).join("\n") });
      resolve();
    });
  });
}

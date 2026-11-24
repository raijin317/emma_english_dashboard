import { spawn, exec, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseStreamLine, type ClaudeEvent } from "./parser";
import { paths } from "../paths";

/**
 * Runs the local Claude Code CLI in print mode and streams its events.
 * Windows-friendly: shell:true, prompt via stdin, process-tree kill on cancel/timeout.
 */

export type RunOptions = {
  prompt: string;
  resume?: string | null;
  /** Tools Claude may use without asking. Empty = generation only. */
  allowedTools?: string[];
  addDirs?: string[];
  cwd?: string;
  timeoutMs?: number;
  maxTurns?: number;
  signal?: AbortSignal;
  onEvent?: (e: ClaudeEvent) => void;
  /** Run now, next to other calls (only the picture job, in its own process, draws a few batches at once). */
  parallel?: boolean;
};

export type RunResult = { text: string; sessionId: string | null; isError: boolean; costUsd: number | null; stderr: string };

const BLOCKED_TOOLS = ["Bash", "PowerShell", "Edit", "Write", "MultiEdit", "NotebookEdit", "WebFetch", "WebSearch", "Task", "Agent"];

const q = (a: string) => (/^[\w\-.,:/\\=]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`);

/**
 * Finds the Claude Code executable that ships with the VS Code extension
 * (…/.vscode/extensions/anthropic.claude-code-<version>-<platform>/resources/native-binary/claude.exe).
 * The newest installed version wins, so extension updates are picked up automatically.
 */
export function findBundledClaude(home = os.homedir()): string | null {
  const exe = process.platform === "win32" ? "claude.exe" : "claude";
  const candidates: { file: string; mtime: number }[] = [];
  for (const editorDir of [".vscode", ".vscode-insiders", ".cursor", ".windsurf"]) {
    const extDir = path.join(home, editorDir, "extensions");
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(extDir).filter((n) => n.toLowerCase().startsWith("anthropic.claude-code"));
    } catch {
      continue;
    }
    for (const name of entries) {
      const file = path.join(extDir, name, "resources", "native-binary", exe);
      try {
        candidates.push({ file, mtime: fs.statSync(file).mtimeMs });
      } catch {
        /* not this one */
      }
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.file ?? null;
}

let cachedCommand: { command: string; source: CliSource } | null = null;
export type CliSource = "env" | "path" | "vscode-extension";

function onPath(cmd: string) {
  try {
    execSync(process.platform === "win32" ? `where ${cmd}` : `command -v ${cmd}`, { stdio: "ignore", windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

/** CLAUDE_CLI_PATH → `claude` on PATH → the Claude Code bundled with the VS Code extension. */
export function resolveCli(): { command: string; source: CliSource } {
  const fromEnv = process.env.CLAUDE_CLI_PATH?.trim();
  if (fromEnv) return { command: fromEnv, source: "env" };
  if (cachedCommand && (cachedCommand.source === "path" || fs.existsSync(cachedCommand.command.replace(/^"|"$/g, "")))) return cachedCommand;
  if (onPath("claude")) cachedCommand = { command: "claude", source: "path" };
  else {
    const bundled = findBundledClaude();
    cachedCommand = bundled ? { command: `"${bundled}"`, source: "vscode-extension" } : { command: "claude", source: "path" };
  }
  return cachedCommand;
}

export function cliCommand() {
  return resolveCli().command;
}

export function buildArgs(o: Pick<RunOptions, "resume" | "allowedTools" | "addDirs" | "maxTurns">) {
  const args = ["-p", "--output-format", "stream-json", "--verbose"];
  if (process.env.CLAUDE_STREAM_PARTIAL !== "0") args.push("--include-partial-messages");
  if (process.env.CLAUDE_MODEL) args.push("--model", process.env.CLAUDE_MODEL);
  if (o.resume) args.push("--resume", o.resume);
  if (o.maxTurns) args.push("--max-turns", String(o.maxTurns));
  // Only the tools a job needs exist at all ("" = none: pure text generation).
  const allowed = o.allowedTools ?? [];
  args.push("--tools", allowed.join(","));
  if (allowed.length) args.push("--allowedTools", allowed.join(","));
  args.push("--disallowedTools", BLOCKED_TOOLS.filter((t) => !allowed.includes(t)).join(","));
  // Restricted: no code-running tools, file tools confined to the working dirs, no user/project
  // settings, hooks or MCP servers — the dashboard's Claude only reads/writes what we give it.
  if (process.env.CLAUDE_RESTRICTED !== "0") args.push("--restricted", "--strict-mcp-config");
  for (const d of o.addDirs ?? []) args.push("--add-dir", d);
  const extra = process.env.CLAUDE_EXTRA_ARGS?.trim();
  if (extra) args.push(...extra.split(/\s+/));
  return args;
}

/** Child env without the markers of an enclosing Claude Code session. */
function childEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k === "CLAUDECODE" || k.startsWith("CLAUDE_CODE_SSE") || k === "CLAUDE_CODE_ENTRYPOINT") delete env[k];
  return env;
}

function killTree(pid: number | undefined) {
  if (!pid) return;
  if (process.platform === "win32") exec(`taskkill /pid ${pid} /T /F`, () => {});
  else
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
}

/* One Claude process at a time. */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

export function runClaude(o: RunOptions): Promise<RunResult> {
  return o.parallel ? runNow(o) : serial(() => runNow(o));
}

function runNow(o: RunOptions): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const cwd = o.cwd ?? emptyWorkDir();
    const cmd = [cliCommand(), ...buildArgs(o).map(q)].join(" ");
    const child = spawn(cmd, { shell: true, cwd, env: childEnv(), windowsHide: true, detached: process.platform !== "win32" });
    let stdoutBuf = "";
    let stderr = "";
    let deltas = "";
    let messages = "";
    let sawDelta = false;
    let result: RunResult | null = null;
    let sessionId: string | null = o.resume ?? null;
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      o.signal?.removeEventListener("abort", onAbort);
      if (err) return reject(err);
      const text = result?.text || messages || deltas;
      resolve(result ? { ...result, text, stderr } : { text, sessionId, isError: !text, costUsd: null, stderr });
    };
    const onAbort = () => {
      killTree(child.pid);
      finish(new Error("Cancelled."));
    };
    const timer = setTimeout(() => {
      killTree(child.pid);
      finish(new Error(`Claude took too long (>${Math.round((o.timeoutMs ?? 180000) / 1000)}s) and was stopped.`));
    }, o.timeoutMs ?? Number(process.env.CLAUDE_TIMEOUT_SEC ?? 180) * 1000);
    o.signal?.addEventListener("abort", onAbort);

    const handle = (e: ClaudeEvent) => {
      if (e.kind === "init" && e.sessionId) sessionId = e.sessionId;
      if (e.kind === "delta") {
        sawDelta = true;
        deltas += e.text;
        o.onEvent?.(e);
        return;
      }
      if (e.kind === "message") {
        messages += (messages ? "\n\n" : "") + e.text;
        if (!sawDelta) o.onEvent?.({ kind: "delta", text: e.text });
        sawDelta = false;
        return;
      }
      if (e.kind === "result") {
        result = { text: e.text, sessionId: e.sessionId ?? sessionId, isError: e.isError, costUsd: e.costUsd, stderr: "" };
      }
      o.onEvent?.(e);
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutBuf += chunk;
      let nl: number;
      while ((nl = stdoutBuf.indexOf("\n")) >= 0) {
        const line = stdoutBuf.slice(0, nl);
        stdoutBuf = stdoutBuf.slice(nl + 1);
        parseStreamLine(line).forEach(handle);
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (c: string) => (stderr += c));
    child.on("error", (err) => finish(new Error("Could not start Claude CLI: " + err.message)));
    child.on("close", (code) => {
      if (stdoutBuf) parseStreamLine(stdoutBuf).forEach(handle);
      if (!result && !messages && !deltas) {
        const hint = /not recognized|not found|ENOENT/i.test(stderr) ? " Is Claude Code CLI installed and on PATH (or CLAUDE_CLI_PATH set)?" : "";
        return finish(new Error(`Claude CLI exited with code ${code}.${hint} ${stderr.trim().slice(0, 400)}`));
      }
      finish();
    });
    child.stdin.on("error", () => {});
    child.stdin.end(o.prompt, "utf8");
  });
}

function emptyWorkDir() {
  const d = paths.tmpDir + "/claude-work";
  fs.mkdirSync(d, { recursive: true });
  return d;
}

export type CliStatus = { ok: boolean; version: string | null; command: string; source: CliSource; error: string | null };

export function claudeStatus(): Promise<CliStatus> {
  const { command, source } = resolveCli();
  return new Promise((resolve) => {
    exec(`${command} --version`, { timeout: 20000, windowsHide: true, env: childEnv() }, (err, stdout, stderr) => {
      if (err) return resolve({ ok: false, version: null, command, source, error: (stderr || err.message).trim().slice(0, 300) });
      resolve({ ok: true, version: stdout.trim(), command, source, error: null });
    });
  });
}

/** Parses Claude Code CLI `--output-format stream-json` lines into simple events. */

export type ClaudeEvent =
  | { kind: "init"; sessionId: string | null }
  | { kind: "delta"; text: string }
  | { kind: "message"; text: string }
  | { kind: "tool"; name: string }
  | { kind: "result"; text: string; sessionId: string | null; isError: boolean; costUsd: number | null };

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null;

export function parseStreamLine(line: string): ClaudeEvent[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return [];
  let o: Json;
  try {
    o = JSON.parse(trimmed);
  } catch {
    return [];
  }
  const sessionId = typeof o.session_id === "string" ? o.session_id : null;
  switch (o.type) {
    case "system":
      return o.subtype === "init" ? [{ kind: "init", sessionId }] : [];
    case "stream_event": {
      const ev = isObj(o.event) ? o.event : null;
      if (ev?.type === "content_block_delta" && isObj(ev.delta) && ev.delta.type === "text_delta" && typeof ev.delta.text === "string") {
        return [{ kind: "delta", text: ev.delta.text }];
      }
      return [];
    }
    case "assistant": {
      const msg = isObj(o.message) ? o.message : null;
      const content = Array.isArray(msg?.content) ? (msg!.content as unknown[]) : [];
      const out: ClaudeEvent[] = [];
      const text = content
        .filter((b): b is Json => isObj(b) && b.type === "text" && typeof b.text === "string")
        .map((b) => String(b.text))
        .join("");
      if (text) out.push({ kind: "message", text });
      for (const b of content) if (isObj(b) && b.type === "tool_use" && typeof b.name === "string") out.push({ kind: "tool", name: b.name });
      return out;
    }
    case "result":
      return [
        {
          kind: "result",
          text: typeof o.result === "string" ? o.result : "",
          sessionId,
          isError: o.is_error === true || (typeof o.subtype === "string" && o.subtype !== "success"),
          costUsd: typeof o.total_cost_usd === "number" ? o.total_cost_usd : null,
        },
      ];
    default:
      return [];
  }
}

/**
 * Finds a fenced JSON block (```<tag> … ```), falling back to ```json and then to the
 * first balanced {...} object in the text.
 */
export function extractJson(text: string, tag?: string): { ok: true; value: unknown; raw: string } | { ok: false; error: string } {
  const candidates: string[] = [];
  const fence = /```([a-zA-Z-]*)\s*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  const tagged: string[] = [];
  const json: string[] = [];
  while ((m = fence.exec(text))) {
    if (tag && m[1] === tag) tagged.push(m[2]);
    else if (m[1] === "json" || m[1] === "") json.push(m[2]);
  }
  candidates.push(...tagged, ...json);
  const balanced = firstBalancedObject(text);
  if (balanced) candidates.push(balanced);
  if (!candidates.length) return { ok: false, error: "No JSON block found in Claude's reply." };
  let lastErr = "";
  for (const c of candidates) {
    try {
      return { ok: true, value: JSON.parse(c), raw: c };
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  return { ok: false, error: "Claude's JSON could not be read: " + lastErr };
}

function firstBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** Text with any fenced pack block removed (for showing the chat reply). */
export function stripBlocks(text: string, tags: string[]) {
  let t = text;
  for (const tag of tags) t = t.replace(new RegExp("```" + tag + "\\s*\\n[\\s\\S]*?```", "g"), "");
  return t.trim();
}

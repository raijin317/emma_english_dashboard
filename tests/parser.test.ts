import { describe, expect, it } from "vitest";
import { extractJson, parseStreamLine, stripBlocks } from "@/server/claude/parser";

describe("parseStreamLine", () => {
  it("reads init, deltas, assistant text, tools and result", () => {
    expect(parseStreamLine(JSON.stringify({ type: "system", subtype: "init", session_id: "s1" }))).toEqual([{ kind: "init", sessionId: "s1" }]);
    expect(parseStreamLine(JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } } }))).toEqual([{ kind: "delta", text: "Hi" }]);
    expect(
      parseStreamLine(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Hello" }, { type: "tool_use", name: "Read", input: {} }] } })),
    ).toEqual([{ kind: "message", text: "Hello" }, { kind: "tool", name: "Read" }]);
    expect(parseStreamLine(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "done", session_id: "s1", total_cost_usd: 0.01 }))).toEqual([
      { kind: "result", text: "done", sessionId: "s1", isError: false, costUsd: 0.01 },
    ]);
  });

  it("ignores noise and bad JSON", () => {
    expect(parseStreamLine("")).toEqual([]);
    expect(parseStreamLine("warning: something")).toEqual([]);
    expect(parseStreamLine("{not json")).toEqual([]);
    expect(parseStreamLine(JSON.stringify({ type: "user" }))).toEqual([]);
  });

  it("marks error results", () => {
    const [e] = parseStreamLine(JSON.stringify({ type: "result", subtype: "error_max_turns", result: "" }));
    expect(e).toMatchObject({ kind: "result", isError: true });
  });
});

describe("extractJson", () => {
  it("prefers the tagged block", () => {
    const t = 'Hi\n```json\n{"a":1}\n```\n```practice-pack\n{"b":2}\n```';
    expect(extractJson(t, "practice-pack")).toMatchObject({ ok: true, value: { b: 2 } });
  });
  it("falls back to json fence and to a bare object", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toMatchObject({ ok: true, value: { a: 1 } });
    expect(extractJson('Sure: {"a": {"b": "}"}} thanks')).toMatchObject({ ok: true, value: { a: { b: "}" } } });
  });
  it("reports missing or broken JSON", () => {
    expect(extractJson("no json here").ok).toBe(false);
    expect(extractJson("```json\n{broken\n```").ok).toBe(false);
  });
  it("stripBlocks removes pack blocks", () => {
    expect(stripBlocks('Here!\n```inspiration-pack\n{"x":1}\n```', ["inspiration-pack"])).toBe("Here!");
  });
});

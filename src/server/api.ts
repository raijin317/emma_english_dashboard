import { connection } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { seedDemo } from "./demo";
import { JobError } from "./claude/jobs";
import { getAppSettings } from "./repo";
import { warmTts } from "./tts/client";
import { warmVoices } from "./tts/warm";
import { HOME_ONLY, ONLINE } from "@/lib/mode";

let booted = false;

/** Every route reads live local data: wait for the request, then make sure the DB is ready. */
export async function boot() {
  await connection();
  // Online: lessons are built in, family data is in D1 (made on first use) — no demo, no voice engine.
  if (ONLINE) return;
  if (!booted) {
    // The demo book/child is only for tests and trying the app (npm run db:seed, or SUNNY_DEMO=1).
    if (process.env.SUNNY_DEMO === "1") seedDemo();
    booted = true;
    if (getAppSettings().ttsEngine === "natural" && process.env.SUNNY_NO_TTS_WARMUP !== "1") {
      warmTts();
      // Make the voice for every lesson that isn't ready yet, quietly, while nobody is tapping.
      warmVoices(10_000);
    }
  }
}

export const ok = (data: unknown, init?: ResponseInit) => Response.json(data, init);
export const fail = (error: string, status = 400, details?: string) => Response.json({ error, details }, { status });

type Handler<C> = (req: Request, ctx: C) => Promise<Response> | Response;

export function route<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    // Outside the try: Next.js uses connection()'s rejection to stop prerendering.
    await boot();
    try {
      return await fn(req, ctx);
    } catch (e) {
      unstable_rethrow(e);
      const err = e as Error;
      console.error("[api]", err);
      return fail(err.message || "Something went wrong.", 500, e instanceof JobError ? e.details : undefined);
    }
  };
}

/**
 * A home-only route (book import, AI Studio, Claude, the voice engine, changing lessons):
 * the online version answers 403 with a friendly message instead.
 */
export function localOnly<C>(fn: Handler<C>): Handler<C> {
  return ONLINE ? () => fail(HOME_ONLY, 403) : fn;
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

/** Server-Sent Events response. */
export function sse(run: (send: (event: string, data: unknown) => void, signal: AbortSignal) => Promise<void>, req: Request) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      try {
        await run(send, req.signal);
      } catch (e) {
        send("error", { message: (e as Error).message, details: e instanceof JobError ? e.details : undefined });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}

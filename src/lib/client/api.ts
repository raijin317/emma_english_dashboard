"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export class ApiError extends Error {
  constructor(
    message: string,
    public details?: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`, (data as { details?: string }).details);
  return data as T;
}

/** Last answer per URL (this tab only), so screens open instantly with it while fresh data loads. */
const lastData = new Map<string, unknown>();

export function useApi<T>(url: string | null) {
  const [tick, setTick] = useState(0);
  const key = url ? `${url}#${tick}` : null;
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null }>(() => ({ key: null, data: url ? ((lastData.get(url) as T) ?? null) : null, error: null }));
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback(
    (data: T) => {
      if (url) lastData.set(url, data);
      setState((s) => ({ ...s, data }));
    },
    [url],
  );

  useEffect(() => {
    if (!url || !key) return;
    let alive = true;
    api<T>(url)
      .then((data) => {
        lastData.set(url, data);
        if (alive) setState({ key, data, error: null });
      })
      .catch((e: Error) => alive && setState((s) => ({ key, data: s.data, error: e.message })));
    return () => {
      alive = false;
    };
  }, [url, key]);

  // Keeps showing the previous data while reloading.
  return { data: state.data, error: state.error, loading: key !== null && state.key !== key, reload, setData };
}

/** POST and read a text/event-stream response. */
export async function streamSSE(url: string, body: unknown, onEvent: (event: string, data: unknown) => void, signal?: AbortSignal) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    const d = await res.json().catch(() => ({}));
    throw new ApiError((d as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = "message";
      let data = "";
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      try {
        onEvent(event, data ? JSON.parse(data) : null);
      } catch {
        onEvent(event, data);
      }
    }
  }
}

/* -------------------- per-device conveniences (localStorage) -------------------- */

const safeGet = (k: string) => {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeSet = (k: string, v: string | null) => {
  try {
    if (v === null) window.localStorage.removeItem(k);
    else window.localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

const SESSION_EVENT = "sunny-session";
const notify = () => window.dispatchEvent(new Event(SESSION_EVENT));
function subscribeSession(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(SESSION_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(SESSION_EVENT, cb);
  };
}

export const childSession = {
  get: () => safeGet("sunny.childId"),
  set: (id: string | null) => {
    safeSet("sunny.childId", id);
    notify();
  },
};

/** Current child id; `undefined` while rendering on the server. */
export function useChildId(): string | null | undefined {
  return useSyncExternalStore(subscribeSession, childSession.get, () => undefined);
}

export const parentSession = {
  isUnlocked: () => {
    try {
      return window.sessionStorage.getItem("sunny.parent") === "1";
    } catch {
      return false;
    }
  },
  unlock: () => {
    try {
      window.sessionStorage.setItem("sunny.parent", "1");
    } catch {}
    notify();
  },
  lock: () => {
    try {
      window.sessionStorage.removeItem("sunny.parent");
    } catch {}
    notify();
  },
};

/** Parent unlock state; `null` while rendering on the server. */
export function useParentUnlocked(): boolean | null {
  return useSyncExternalStore(subscribeSession, parentSession.isUnlocked, () => null);
}

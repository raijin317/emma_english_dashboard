/**
 * Two builds of the same app (docs/CLOUDFLARE.md):
 * - home (default): the family PC — book import, AI Studio, Claude, the voice engine, editing lessons.
 * - online (`NEXT_PUBLIC_SUNNY_ONLINE=1`, Cloudflare Workers): lessons, pictures and voices come from the files
 *   made at home (`npm run online:export`) and are read-only; children, progress, PIN and settings live in D1.
 * Next.js writes the value into the build (server and browser), so it is fixed per build.
 */
export const ONLINE = process.env.NEXT_PUBLIC_SUNNY_ONLINE === "1";

/** Shown wherever a home-only feature is hidden or refused online. */
export const HOME_ONLY = "This works only in the app on your home computer. Make it there, then publish the online version again.";

/** Where the files made by `npm run online:export` are served from (public/online/…). */
export const ONLINE_BASE = "/online";

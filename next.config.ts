import type { NextConfig } from "next";

/** Online build for Cloudflare Workers (npm run cf:build) — see src/lib/mode.ts and docs/CLOUDFLARE.md. */
const ONLINE = process.env.NEXT_PUBLIC_SUNNY_ONLINE === "1";

/** Native / heavy packages used only by the home app (book import, AI Studio files, topic pictures, the voice engine). */
const HOME_ONLY_PACKAGES = ["@napi-rs/canvas", "pdfjs-dist", "pdfjs-dist/legacy/build/pdf.mjs", "kokoro-js", "@huggingface/transformers"];

const nextConfig: NextConfig = {
  // Online: off — in the Workers runtime, Cache Components hangs page rendering (Next.js warns that it relies on
  // Node's setTimeout). The app uses no cache APIs (all data is fetched in the browser), so nothing else changes.
  cacheComponents: !ONLINE,
  partialPrefetching: !ONLINE,
  // Home: native / heavy packages stay outside the server bundle.
  serverExternalPackages: ONLINE ? [] : ["@napi-rs/canvas", "pdfjs-dist"],
  // The family's own files are read at runtime only: never trace them into a build's output (the online build copies it).
  outputFileTracingExcludes: { "*": ["data/**", "resources/**", "content/books/**", ".tmp/**", "tests/**", "docs/**"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
    // Online: those packages are replaced by a stub (their routes answer "home only" before using them).
    ...(ONLINE ? { resolveAlias: Object.fromEntries(HOME_ONLY_PACKAGES.map((p) => [p, "./src/server/homeOnlyStub.ts"])) } : {}),
  },
};

export default nextConfig;

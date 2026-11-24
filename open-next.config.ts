import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

/**
 * Online version (docs/CLOUDFLARE.md). Lessons are built in and never revalidated, so the pages prerendered at build
 * time are served straight from the Worker's static assets (cache interception = without starting Next.js) — much less
 * CPU per request, which matters on the Workers Free plan (10 ms). The other pages and the API render on demand.
 */
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});

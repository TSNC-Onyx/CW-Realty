import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Pages are rendered per request (strict CSP uses a per-request nonce), so no
// incremental cache is configured yet. Add an R2 cache when static pages exist.
export default defineCloudflareConfig({});

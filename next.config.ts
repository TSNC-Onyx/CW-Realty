import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

import { SECURITY_HEADERS } from "./src/lib/security/security-headers";

const PRODUCTION_HOST = "www.charliewardrealty.com";
// Cloudflare Workers Builds names the commit it builds; problems carry it so their stack
// traces are read back with that build's source maps (docs/error-logging-a-grade-plan.md).
const RELEASE = process.env.WORKERS_CI_COMMIT_SHA ?? "";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: { NEXT_PUBLIC_RELEASE: RELEASE },
  // Browser source maps are made for the private store only: scripts/hide-browser-source-maps.mjs
  // moves them out of the published files after every build (docs/error-logging-a-grade-plan.md).
  productionBrowserSourceMaps: true,
  // The middleware removes trailing slashes itself so every redirect is one 301 hop.
  skipTrailingSlashRedirect: true,
  // The link-only seller consulting page became Selected services (owner choice 2026-10-02).
  async redirects() {
    return [{ source: "/services/seller-consulting", destination: "/services/selected-services", statusCode: 301 }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // Preview and local hosts must never appear in search results.
      {
        source: "/:path*",
        missing: [{ type: "host", value: PRODUCTION_HOST }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

initOpenNextCloudflareForDev();

export default nextConfig;

import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

import { SECURITY_HEADERS } from "./src/lib/security/security-headers";

const PRODUCTION_HOST = "www.charliewardrealty.com";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The middleware removes trailing slashes itself so every redirect is one 301 hop.
  skipTrailingSlashRedirect: true,
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

import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

import { SECURITY_HEADERS } from "./src/lib/security/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The middleware removes trailing slashes itself so every redirect is one 301 hop.
  skipTrailingSlashRedirect: true,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

initOpenNextCloudflareForDev();

export default nextConfig;

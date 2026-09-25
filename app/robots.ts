import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site/navigation";

// The admin portal is never indexed; preview hosts also send X-Robots-Tag: noindex
// (next.config.ts).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

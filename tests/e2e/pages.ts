import { STATIC_PAGE_PATHS, UNLISTED_PAGE_PATHS } from "../../src/lib/site/navigation";

// Every public page the site serves (listed and link-only), plus the viewports Style §10 requires.

export const PUBLIC_PAGE_PATHS = [...STATIC_PAGE_PATHS, ...UNLISTED_PAGE_PATHS];

// Record pages, checked only when a database with imported content is connected.
export const CONTENT_PAGE_PATHS = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? ["/listings/5423-pine-level-dr-browns-summit-nc", "/listings/3826-burlington-rd-greensboro-nc", "/team/charlie-ward", "/team/ashley-edwards"]
  : [];

export const MISSING_PAGE_PATH = "/this-page-does-not-exist";

export const VIEWPORTS = {
  smallPhone: { width: 320, height: 640 },
  phone: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
} as const;

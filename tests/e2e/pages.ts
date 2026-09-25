import { STATIC_PAGE_PATHS } from "../../src/lib/site/navigation";

// Every public page Phase 1 serves, plus the viewports Style §10 requires.

export const PUBLIC_PAGE_PATHS = [...STATIC_PAGE_PATHS];

export const MISSING_PAGE_PATH = "/this-page-does-not-exist";

export const VIEWPORTS = {
  smallPhone: { width: 320, height: 640 },
  phone: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
} as const;

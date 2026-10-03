// Which Quick Check key a page was built with (docs/cwr-stale-quick-check-addendum.md §1).
// Next.js writes NEXT_PUBLIC values into the JavaScript at build time, so a page opened
// before a rebuild keeps the old key. The page sends its key with the form; the server
// compares it with its own. A site key is public, so this reveals nothing. Safe to import
// from browser and server code alike.

export const BOT_CHECK_KEY_FIELD = "botCheckKey";

// Cloudflare's published testing site keys: always pass, always block, or always ask.
const TEST_SITE_KEY_PATTERN = /^[123]x0{20}[A-Z]{2}$/;

/** The site key this build was made with; null when none is set (local development). */
export function getTurnstileSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null;
}

export function isTestSiteKey(siteKey: string | null): boolean {
  return siteKey !== null && TEST_SITE_KEY_PATTERN.test(siteKey);
}

/**
 * Test keys pass every bot, so production refuses them (decision D3). Local previews and the
 * automated tests are production builds too; they opt in with NEXT_PUBLIC_ALLOW_TURNSTILE_TEST_KEYS.
 */
export function areTestKeysAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ALLOW_TURNSTILE_TEST_KEYS === "true";
}

/** True when the page sent a key and it isn't the one this deployment was built with. */
export function isOutdatedBotCheckKey(pageKey: FormDataEntryValue | null): boolean {
  const siteKey = getTurnstileSiteKey();
  if (!siteKey || typeof pageKey !== "string" || pageKey === "") return false;
  return pageKey !== siteKey;
}

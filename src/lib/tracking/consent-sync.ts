import { getStoredAttribution } from "@/lib/tracking/attribution-store";

// Asks the server to set the visitor's cookies again (docs/cwr-ads-analytics-fixes-plan.md, R7,
// D15): Safari keeps a cookie written by a script only 7 days, one the server sets much longer.
// One call at a time, and the newest choice always goes last, so a slow "accept" answer can never
// land after a "reject". Browser-only module.

const CONSENT_PATH = "/consent";
const SYNC_DEADLINE_MS = 3000;

/** The newest consent cookie the browser wrote; rewritten before each call so the call carries it. */
let newestChoiceCookie: string | null = null;
let hasUnsentChange = false;
let runningSync: Promise<void> | null = null;

/**
 * cookieString: a new choice, just written with document.cookie. Left out (a page load with new
 * ad click IDs), nothing is rewritten, so the 180-day clock never restarts. Settles once the newest
 * state has been sent, after a failure, or after 3 seconds in total.
 */
export function sendConsentToServer({ cookieString }: { cookieString?: string } = {}): Promise<void> {
  if (cookieString !== undefined) newestChoiceCookie = cookieString;
  hasUnsentChange = true;
  runningSync ??= runSyncLoop().finally(() => {
    runningSync = null;
  });
  return runningSync;
}

async function runSyncLoop(): Promise<void> {
  const signal = AbortSignal.timeout(SYNC_DEADLINE_MS);
  try {
    while (hasUnsentChange) {
      hasUnsentChange = false;
      await postConsent(signal);
    }
  } catch {
    // Safe to stop: the browser's own cookie holds the choice (written again here, in case an
    // older answer's cookie landed as the deadline hit); the server's copy only makes it last
    // longer in Safari, and the visitor is simply asked again later.
    if (newestChoiceCookie) document.cookie = newestChoiceCookie;
  }
}

async function postConsent(signal: AbortSignal): Promise<void> {
  if (newestChoiceCookie) document.cookie = newestChoiceCookie;
  await fetch(CONSENT_PATH, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attribution: getStoredAttribution() }),
    signal,
  });
}

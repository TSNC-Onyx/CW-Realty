import { EXPIRED_ATTRIBUTION_COOKIE, getAttributionFromField, getAttributionFromUrl, getEarlierLanding, isSameAttribution, type Attribution } from "@/lib/tracking/attribution";

// Where the landing link's click IDs wait in the browser (plan decision 12): in memory until
// the visitor allows Advertising, then in this tab's sessionStorage so later pages' forms can
// send them. The server keeps them for other tabs in the cwr_attribution cookie
// (docs/cwr-ads-analytics-fixes-plan.md, R8). Browser-only module.

const STORAGE_KEY = "cwr-attribution";
const CHANGE_EVENT = "cwr:attribution-change";

let landingAttribution: Attribution | null = null;

/** False when storage is blocked (private windows): click IDs are then simply not kept. */
function writeStorage(value: string | null): boolean {
  let isWritten = true;
  try {
    if (value === null) window.sessionStorage.removeItem(STORAGE_KEY);
    else window.sessionStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Blocked storage is reported to the caller as "nothing kept", never as an error.
    isWritten = false;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return isWritten;
}

/** Notes the click IDs on the page the visitor arrived on; nothing is stored yet. */
export function rememberLandingAttribution(): void {
  const landing = getAttributionFromUrl({ url: new URL(window.location.href), landedAt: Date.now() });
  if (!landing) return;
  // A reload of an address that still holds the same click keeps its first landing (plan D17).
  landingAttribution = getEarlierLanding(getAttributionFromField(getStoredAttribution()), landing);
}

/** Called once Advertising is allowed. A newer ad click replaces an older one. True only when the stored click IDs changed. */
export function keepAttribution(): boolean {
  if (!landingAttribution) return false;
  if (isSameAttribution(getAttributionFromField(getStoredAttribution()), landingAttribution)) return false;
  return writeStorage(JSON.stringify(landingAttribution));
}

/** Called when Advertising is refused or withdrawn; also deletes the server's click cookie. */
export function forgetAttribution(): void {
  landingAttribution = null;
  writeStorage(null);
  document.cookie = EXPIRED_ATTRIBUTION_COOKIE;
}

export function getStoredAttribution(): string {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function subscribeToAttribution(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

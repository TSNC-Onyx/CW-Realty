import { getAttributionFromUrl, type Attribution } from "@/lib/tracking/attribution";

// Where the landing link's click IDs wait in the browser (plan decision 12): in memory until
// the visitor allows Advertising, then in this tab's sessionStorage so later pages' forms can
// send them. Browser-only module.

const STORAGE_KEY = "cwr-attribution";
const CHANGE_EVENT = "cwr:attribution-change";

let landingAttribution: Attribution | null = null;

function writeStorage(value: string | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(STORAGE_KEY);
    else window.sessionStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage blocked (private windows): click IDs are simply not kept.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Notes the click IDs on the page the visitor arrived on; nothing is stored yet. */
export function rememberLandingAttribution(): void {
  landingAttribution = getAttributionFromUrl({ url: new URL(window.location.href), landedAt: Date.now() }) ?? landingAttribution;
}

/** Called once Advertising is allowed. A newer ad click replaces an older one. */
export function keepAttribution(): void {
  if (!landingAttribution) return;
  writeStorage(JSON.stringify(landingAttribution));
}

/** Called when Advertising is refused or withdrawn. */
export function forgetAttribution(): void {
  landingAttribution = null;
  writeStorage(null);
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

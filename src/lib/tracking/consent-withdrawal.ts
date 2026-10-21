import { forgetAttribution } from "@/lib/tracking/attribution-store";
import type { ConsentChoice } from "@/lib/tracking/consent";
import { sendConsentToServer } from "@/lib/tracking/consent-sync";
import { updateTagConsent } from "@/lib/tracking/data-layer";
import { deleteTrackerCookies } from "@/lib/tracking/tracker-cookies";

// A narrower cookie choice (docs/cwr-ads-analytics-fixes-plan.md, R7, edge cases 5–6). Tags
// already running cannot be told to forget what they set, so their cookies are deleted and the
// page reloads without them. Browser-only module.

/** cookieString: the new choice, already written with document.cookie. */
export async function withdrawConsent({ previous, next, cookieString }: { previous: ConsentChoice; next: ConsentChoice; cookieString: string }): Promise<void> {
  // Only what both choices allow: running tags stop writing cookies at once, and nothing is newly
  // allowed, so no cwr_consent_update is sent; a category turned on here starts after the reload.
  updateTagConsent({ analytics: previous.analytics && next.analytics, ads: previous.ads && next.ads });
  if (!next.ads) forgetAttribution();
  await sendConsentToServer({ cookieString });
  // After the wait, so nothing a tag wrote meanwhile survives the reload.
  deleteTrackerCookies();
  window.location.reload();
}

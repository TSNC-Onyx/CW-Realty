import "server-only";

import { cookies, headers } from "next/headers";

import { CONSENT_COOKIE, REJECTED_CONSENT, getAllowedConsent, getConsentFromCookie, type ConsentChoice } from "@/lib/tracking/consent";

// The visitor's choice as the server sees it: the consent cookie, limited by the browser's
// Global Privacy Control header (plan decision 4).

const GPC_HEADER = "sec-gpc";
const GPC_ON = "1";

export type VisitorConsent = {
  /** What the visitor chose, or null before they choose. */
  choice: ConsentChoice | null;
  /** What may actually run: the choice with GPC applied; everything off before a choice. */
  allowed: ConsentChoice;
  isGpcOn: boolean;
};

export async function fetchVisitorConsent(): Promise<VisitorConsent> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const choice = getConsentFromCookie(cookieStore.get(CONSENT_COOKIE)?.value);
  const isGpcOn = headerStore.get(GPC_HEADER) === GPC_ON;
  const allowed = getAllowedConsent({ choice: choice ?? REJECTED_CONSENT, isGpcOn });
  return { choice, allowed, isGpcOn };
}

"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { forgetAttribution, keepAttribution, rememberLandingAttribution, restoreClickIdsInAddress } from "@/lib/tracking/attribution-store";
import { getAllowedConsent, getConsentCookieString, hasAnyConsent, type ConsentChoice } from "@/lib/tracking/consent";
import { sendConsentToServer } from "@/lib/tracking/consent-sync";
import { withdrawConsent } from "@/lib/tracking/consent-withdrawal";
import { isTagManagerRunning, startTagManager, updateTagConsent } from "@/lib/tracking/data-layer";

// The visitor's choice in the browser (plan decisions 1–4, 12, 14): nothing starts before a
// choice, a wider choice starts or updates Tag Manager, a narrower one clears and reloads. The
// server then sets the same cookies again (docs/cwr-ads-analytics-fixes-plan.md, R7).

export type TagManagerConfig = { containerId: string; scriptOrigin: string; nonce: string };

export type ConsentOptions = TagManagerConfig & { initialChoice: ConsentChoice | null; isGpcOnServer: boolean };

declare global {
  interface Navigator {
    globalPrivacyControl?: boolean;
  }
}

function getBrowserGpc({ isGpcOnServer }: { isGpcOnServer: boolean }): boolean {
  return isGpcOnServer || navigator.globalPrivacyControl === true;
}

function subscribeToNothing(): () => void {
  return () => {};
}

function isNarrower({ previous, next }: { previous: ConsentChoice; next: ConsentChoice }): boolean {
  return (previous.analytics && !next.analytics) || (previous.ads && !next.ads);
}

/** Starts or updates Tag Manager; true when new ad click IDs were stored (the server should keep them). */
function applyAllowedConsent({ allowed, tagManager }: { allowed: ConsentChoice; tagManager: TagManagerConfig }): boolean {
  const hasNewClick = allowed.ads && keepAttribution();
  if (!allowed.ads) forgetAttribution();
  if (!hasAnyConsent(allowed)) return hasNewClick;
  if (isTagManagerRunning()) {
    updateTagConsent(allowed);
    return hasNewClick;
  }
  // Click IDs go back in the address only for Advertising, and only before the first start (plan D4).
  startTagManager({ ...tagManager, choice: allowed, beforeStart: allowed.ads ? restoreClickIdsInAddress : undefined });
  return hasNewClick;
}

/** Writes the choice and returns the cookie string, which the server call writes again first. */
function writeConsentCookie(choice: ConsentChoice): string {
  const cookieString = getConsentCookieString({ choice, now: new Date(), isSecure: window.location.protocol === "https:" });
  document.cookie = cookieString;
  return cookieString;
}

export function useConsent({ initialChoice, isGpcOnServer, containerId, scriptOrigin, nonce }: ConsentOptions) {
  const [choice, setChoice] = useState<ConsentChoice | null>(initialChoice);
  const tagManager = useMemo(() => ({ containerId, scriptOrigin, nonce }), [containerId, scriptOrigin, nonce]);
  const isGpcOn = useSyncExternalStore(subscribeToNothing, () => getBrowserGpc({ isGpcOnServer }), () => isGpcOnServer);

  // Runs once per page load: note the landing link, then honor a choice made on an earlier visit.
  useEffect(() => {
    rememberLandingAttribution();
    if (!initialChoice) return;
    const hasNewClick = applyAllowedConsent({ allowed: getAllowedConsent({ choice: initialChoice, isGpcOn: getBrowserGpc({ isGpcOnServer }) }), tagManager });
    // A returning visitor arriving from a new ad: the server keeps the click IDs for other tabs.
    if (hasNewClick) void sendConsentToServer();
  }, [initialChoice, isGpcOnServer, tagManager]);

  const saveChoice = (next: ConsentChoice) => {
    const allowed = getAllowedConsent({ choice: next, isGpcOn });
    const previous = choice ? getAllowedConsent({ choice, isGpcOn }) : null;
    const cookieString = writeConsentCookie(allowed);
    setChoice(allowed);
    if (previous && isTagManagerRunning() && isNarrower({ previous, next: allowed })) {
      void withdrawConsent({ previous, next: allowed, cookieString });
      return;
    }
    applyAllowedConsent({ allowed, tagManager });
    void sendConsentToServer({ cookieString });
  };

  return { choice, isGpcOn, saveChoice };
}

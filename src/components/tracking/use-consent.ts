"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { forgetAttribution, keepAttribution, rememberLandingAttribution } from "@/lib/tracking/attribution-store";
import { getAllowedConsent, getConsentCookieString, hasAnyConsent, type ConsentChoice } from "@/lib/tracking/consent";
import { isTagManagerRunning, startTagManager, updateTagConsent } from "@/lib/tracking/data-layer";
import { deleteTrackerCookies } from "@/lib/tracking/tracker-cookies";

// The visitor's choice in the browser (plan decisions 1–4, 12, 14): nothing starts before a
// choice, a wider choice starts or updates Tag Manager, a narrower one clears and reloads.

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

function applyAllowedConsent({ allowed, tagManager }: { allowed: ConsentChoice; tagManager: TagManagerConfig }): void {
  if (allowed.ads) keepAttribution();
  else forgetAttribution();
  if (!hasAnyConsent(allowed)) return;
  if (isTagManagerRunning()) updateTagConsent(allowed);
  else startTagManager({ ...tagManager, choice: allowed });
}

function writeConsentCookie(choice: ConsentChoice): void {
  document.cookie = getConsentCookieString({ choice, now: new Date(), isSecure: window.location.protocol === "https:" });
}

// Tags already running cannot be told to forget what they set, so their cookies are deleted
// and the page reloads without them.
function withdrawConsent(): void {
  deleteTrackerCookies();
  forgetAttribution();
  window.location.reload();
}

export function useConsent({ initialChoice, isGpcOnServer, containerId, scriptOrigin, nonce }: ConsentOptions) {
  const [choice, setChoice] = useState<ConsentChoice | null>(initialChoice);
  const tagManager = useMemo(() => ({ containerId, scriptOrigin, nonce }), [containerId, scriptOrigin, nonce]);
  const isGpcOn = useSyncExternalStore(subscribeToNothing, () => getBrowserGpc({ isGpcOnServer }), () => isGpcOnServer);

  // Runs once per page load: note the landing link, then honor a choice made on an earlier visit.
  useEffect(() => {
    rememberLandingAttribution();
    if (!initialChoice) return;
    applyAllowedConsent({ allowed: getAllowedConsent({ choice: initialChoice, isGpcOn: getBrowserGpc({ isGpcOnServer }) }), tagManager });
  }, [initialChoice, isGpcOnServer, tagManager]);

  const saveChoice = (next: ConsentChoice) => {
    const allowed = getAllowedConsent({ choice: next, isGpcOn });
    const previous = choice ? getAllowedConsent({ choice, isGpcOn }) : null;
    writeConsentCookie(allowed);
    setChoice(allowed);
    if (previous && isTagManagerRunning() && isNarrower({ previous, next: allowed })) {
      withdrawConsent();
      return;
    }
    applyAllowedConsent({ allowed, tagManager });
  };

  return { choice, isGpcOn, saveChoice };
}

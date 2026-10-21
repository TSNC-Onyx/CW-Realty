import type { ConsentChoice } from "@/lib/tracking/consent";

// Google Tag Manager in "basic" consent mode (Features §3–4): the container loads only after
// the visitor allows something, Consent Mode v2 says exactly what, and key events are sent
// only while it runs. Browser-only module.

export const DEFAULT_TAG_SCRIPT_ORIGIN = "https://www.googletagmanager.com";
const CONSENT_UPDATE_WAIT_MS = 500;
/** Tells running tags that a category was newly allowed, so a tag waiting for it can fire on this page (plan D13). */
export const CONSENT_UPDATE_EVENT = "cwr_consent_update";

export type KeyEventName = "cwr_call" | "cwr_text" | "cwr_contact_form" | "cwr_booking_request" | "cwr_chat_question" | "cwr_chat_topic" | "cwr_chat_handoff";

/** Enhanced Conversions fields: SHA-256 hashes only, never the plain email or phone. */
export type GoogleUserData = { sha256_email_address?: string; sha256_phone_number?: string };

export type KeyEvent = { name: KeyEventName; eventId: string; userData?: GoogleUserData | null };

type ConsentState = "granted" | "denied";

type ConsentModeState = {
  ad_storage: ConsentState;
  ad_user_data: ConsentState;
  ad_personalization: ConsentState;
  analytics_storage: ConsentState;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

let runningConsent: ConsentChoice | null = null;

function getConsentState({ isGranted }: { isGranted: boolean }): ConsentState {
  return isGranted ? "granted" : "denied";
}

export function getConsentModeState(choice: ConsentChoice): ConsentModeState {
  return {
    ad_storage: getConsentState({ isGranted: choice.ads }),
    ad_user_data: getConsentState({ isGranted: choice.ads }),
    ad_personalization: getConsentState({ isGranted: choice.ads }),
    analytics_storage: getConsentState({ isGranted: choice.analytics }),
  };
}

export function getTagScriptUrl({ containerId, scriptOrigin }: { containerId: string; scriptOrigin: string }): string {
  return `${scriptOrigin}/gtm.js?id=${encodeURIComponent(containerId)}`;
}

function getDataLayer(): unknown[] {
  window.dataLayer ??= [];
  return window.dataLayer;
}

// Google's tags read gtag() commands as Arguments objects, not arrays (gtag.js snippet), so
// the parameter list only types the call sites.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function gtag(..._commandParts: unknown[]): void {
  // eslint-disable-next-line prefer-rest-params
  getDataLayer().push(arguments);
}

function appendTagScript({ src, nonce }: { src: string; nonce: string }): void {
  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  // Google's nonce-aware snippet: Tag Manager passes this nonce on to the scripts it adds.
  script.nonce = nonce;
  document.head.append(script);
}

/**
 * Starts Tag Manager once, with consent defaults set to "denied" before anything runs.
 * beforeStart runs before the first data-layer entry and before the script is added.
 */
export function startTagManager({ containerId, scriptOrigin, nonce, choice, beforeStart }: { containerId: string; scriptOrigin: string; nonce: string; choice: ConsentChoice; beforeStart?: () => void }): void {
  if (runningConsent) return;
  beforeStart?.();
  runningConsent = choice;
  gtag("consent", "default", { ...getConsentModeState({ analytics: false, ads: false }), wait_for_update: CONSENT_UPDATE_WAIT_MS });
  gtag("consent", "update", getConsentModeState(choice));
  getDataLayer().push({ "gtm.start": Date.now(), event: "gtm.js" });
  appendTagScript({ src: getTagScriptUrl({ containerId, scriptOrigin }), nonce });
}

export function isTagManagerRunning(): boolean {
  return runningConsent !== null;
}

function isNewlyAllowed({ previous, next }: { previous: ConsentChoice; next: ConsentChoice }): boolean {
  return (next.analytics && !previous.analytics) || (next.ads && !previous.ads);
}

/** Tells running tags about a wider choice, or, before a withdrawal reloads the page, what both choices allow. */
export function updateTagConsent(choice: ConsentChoice): void {
  if (!runningConsent) return;
  const isWider = isNewlyAllowed({ previous: runningConsent, next: choice });
  runningConsent = choice;
  gtag("consent", "update", getConsentModeState(choice));
  if (isWider) getDataLayer().push({ event: CONSENT_UPDATE_EVENT });
}

/** Sends a key event to Tag Manager; does nothing until the visitor has allowed tracking. */
export function pushKeyEvent({ name, eventId, userData }: KeyEvent): void {
  if (!runningConsent) return;
  const shouldIncludeUserData = runningConsent.ads && userData;
  getDataLayer().push({ event: name, event_id: eventId, ...(shouldIncludeUserData ? { user_data: userData } : {}) });
}

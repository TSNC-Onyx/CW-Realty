import type { ConsentChoice } from "@/lib/tracking/consent";

// Google Tag Manager in "basic" consent mode (Features §3–4): the container loads only after
// the visitor allows something, Consent Mode v2 says exactly what, and key events are sent
// only while it runs. Browser-only module.

export const DEFAULT_TAG_SCRIPT_ORIGIN = "https://www.googletagmanager.com";
const CONSENT_UPDATE_WAIT_MS = 500;

export type KeyEventName = "cwr_call" | "cwr_text" | "cwr_contact_form" | "cwr_booking_request" | "cwr_chat_question" | "cwr_chat_handoff";

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

/** Starts Tag Manager once, with consent defaults set to "denied" before anything runs. */
export function startTagManager({ containerId, scriptOrigin, nonce, choice }: { containerId: string; scriptOrigin: string; nonce: string; choice: ConsentChoice }): void {
  if (runningConsent) return;
  runningConsent = choice;
  gtag("consent", "default", { ...getConsentModeState({ analytics: false, ads: false }), wait_for_update: CONSENT_UPDATE_WAIT_MS });
  gtag("consent", "update", getConsentModeState(choice));
  getDataLayer().push({ "gtm.start": Date.now(), event: "gtm.js" });
  appendTagScript({ src: getTagScriptUrl({ containerId, scriptOrigin }), nonce });
}

export function isTagManagerRunning(): boolean {
  return runningConsent !== null;
}

/** Tells running tags about a wider choice (a narrower one reloads the page instead). */
export function updateTagConsent(choice: ConsentChoice): void {
  if (!runningConsent) return;
  runningConsent = choice;
  gtag("consent", "update", getConsentModeState(choice));
}

/** Sends a key event to Tag Manager; does nothing until the visitor has allowed tracking. */
export function pushKeyEvent({ name, eventId, userData }: KeyEvent): void {
  if (!runningConsent) return;
  const shouldIncludeUserData = runningConsent.ads && userData;
  getDataLayer().push({ event: name, event_id: eventId, ...(shouldIncludeUserData ? { user_data: userData } : {}) });
}

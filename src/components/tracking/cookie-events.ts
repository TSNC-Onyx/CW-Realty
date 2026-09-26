// "Cookie settings" links anywhere on the page ask the consent manager to open its dialog.
// The event is cancelable: the manager cancels it when it handles the request, so without
// trackers (no manager) the link simply goes to the privacy policy.

export const OPEN_COOKIE_SETTINGS_EVENT = "cwr:open-cookie-settings";

/** True when the consent manager opened its settings. */
export function requestCookieSettings(): boolean {
  return !window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT, { cancelable: true }));
}

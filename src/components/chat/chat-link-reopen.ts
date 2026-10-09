// A page link inside the chat reopens the chat on the page it leads to, on computers and
// tablets (docs/cwr-chat-guided-options-plan.md §5). The link leaves a short-lived note in this
// tab's sessionStorage; the launcher reads it when the page changes. Storage can be blocked:
// then the chat simply closes, as it does for any other page change.

const STORAGE_KEY = "cwr-chat-link-followed";
const MAX_AGE_MS = 30_000;

/** href: the link's target; a link to the page already open changes nothing, so it leaves no note. */
export function markChatLinkFollowed(href: string): void {
  if (new URL(href, window.location.href).pathname === window.location.pathname) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // Not saved: the chat closes on the next page, as it would anyway.
  }
}

/** Read-only, so it is safe during render; the launcher clears the note afterwards. */
export function wasChatLinkJustFollowed(): boolean {
  try {
    const followedAt = Number(window.sessionStorage.getItem(STORAGE_KEY));
    return followedAt > 0 && Date.now() - followedAt <= MAX_AGE_MS;
  } catch {
    return false;
  }
}

export function clearChatLinkFollowed(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

// Any "Chat" control on the page asks the one chat widget to open through this event, so
// server-drawn links (the action bar) need no shared client state.
export const OPEN_CHAT_EVENT = "cwr:open-chat";

export function openChat(): void {
  window.dispatchEvent(new Event(OPEN_CHAT_EVENT));
}

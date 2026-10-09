// One set of words for the Quick Check everywhere it appears: contact, TouchUp booking,
// chat, "Talk to a person", admin sign-in and password reset (docs/cwr-reliability-round-plan.md
// §2.5, docs/cwr-stale-quick-check-addendum.md §3). The check is usually invisible, so the
// words never ask anyone to "complete" it.

export const BOT_CHECK_MESSAGES = {
  checking: "Running a quick check…",
  needsClick: "Tick the box below to finish the quick check.",
  notLoaded: "The quick check didn't load.",
  unavailable: "The quick check isn't working right now.",
  refused: "The quick check didn't go through. Try again. If it happens again, tap Refresh page.",
  outdatedAutoRefresh: "This page was out of date. Refreshing it for you…",
  outdatedRefreshButton: "This page was out of date. Tap Refresh page and what you typed will be kept.",
  refreshLoop: "Refreshing didn't fix it. Close this tab and open the page again.",
} as const;

export const BOT_CHECK_ACTION_LABELS = {
  retry: "Try again",
  refreshPage: "Refresh page",
  refreshNow: "Refresh now",
} as const;

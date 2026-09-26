// Wording for the dashboard: greeting, the "Today" strip, and each area card's status line.
// Pure functions of the counts, so they are tested without a database.

const OFFICE_TIME_ZONE = "America/New_York";
const MORNING_ENDS_HOUR = 12;
const AFTERNOON_ENDS_HOUR = 17;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const INBOX_PATH = "/admin/inbox";

const HOUR_FORMAT = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: OFFICE_TIME_ZONE });
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: OFFICE_TIME_ZONE });

export type EditorCounts = {
  unread: number;
  oldestNewAt: string | null;
  activeRecipients: number;
  liveListings: number;
  draftListings: number;
  shownMembers: number;
  hiddenMembers: number;
  trashItems: number;
  people: number;
  weekChats: number;
  policySummary: string;
  closedDeals: number;
  trackingSummary: string;
};

export type StaffCounts = { waitingReply: number; assignedOpen: number };

export type TodayFigure = { key: string; value: number; label: string; detail: string; href: string; isActionNeeded: boolean };

export type AreaStats = Record<string, string>;

function getPlural(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getElapsedText(elapsedMs: number): string {
  if (elapsedMs < HOUR_MS) return getPlural(Math.max(1, Math.floor(elapsedMs / MINUTE_MS)), "minute", "minutes");
  if (elapsedMs < DAY_MS) return getPlural(Math.floor(elapsedMs / HOUR_MS), "hour", "hours");
  return getPlural(Math.floor(elapsedMs / DAY_MS), "day", "days");
}

/** "Good morning" / "Good afternoon" / "Good evening" in the office's time zone. */
export function getGreeting(now: Date): string {
  const hour = Number(HOUR_FORMAT.format(now));
  if (hour < MORNING_ENDS_HOUR) return "Good morning";
  if (hour < AFTERNOON_ENDS_HOUR) return "Good afternoon";
  return "Good evening";
}

/** "Thursday, September 25" in the office's time zone. */
export function getDateLine(now: Date): string {
  return DATE_FORMAT.format(now);
}

/** "Oldest waiting 2 hours", or "Nothing waiting" when no new request is open. */
export function getWaitingText({ oldestNewAt, now }: { oldestNewAt: string | null; now: Date }): string {
  if (!oldestNewAt) return "Nothing waiting";
  return `Oldest waiting ${getElapsedText(now.getTime() - new Date(oldestNewAt).getTime())}`;
}

/** Owners and managers: four figures; anything needing action is flagged (shown in gold). */
export function getEditorToday({ counts, now }: { counts: EditorCounts; now: Date }): TodayFigure[] {
  const hasRecipients = counts.activeRecipients > 0;
  return [
    { key: "inbox", value: counts.unread, label: "New messages", detail: getWaitingText({ oldestNewAt: counts.oldestNewAt, now }), href: INBOX_PATH, isActionNeeded: counts.unread > 0 },
    { key: "listings", value: counts.liveListings, label: "Live listings", detail: counts.draftListings === 0 ? "No drafts waiting" : `${getPlural(counts.draftListings, "draft", "drafts")} not published`, href: "/admin/listings", isActionNeeded: false },
    { key: "chats", value: counts.weekChats, label: "Chats this week", detail: "In the last 7 days", href: "/admin/chats", isActionNeeded: false },
    { key: "notifications", value: counts.activeRecipients, label: "Alert recipients", detail: hasRecipients ? "Get an email for every request" : "Nobody gets alerts yet", href: "/admin/notifications", isActionNeeded: !hasRecipients },
  ];
}

/** Staff: only their own messages. */
export function getStaffToday(counts: StaffCounts): TodayFigure[] {
  return [
    { key: "waiting", value: counts.waitingReply, label: "Waiting on my reply", detail: "Assigned to you, not yet answered", href: INBOX_PATH, isActionNeeded: counts.waitingReply > 0 },
    { key: "assigned", value: counts.assignedOpen, label: "Assigned to me", detail: "Open messages you own", href: INBOX_PATH, isActionNeeded: false },
  ];
}

/** Short status line under each area card (Admin §1 "every editable area as a labeled card"). */
export function getAreaStats(counts: EditorCounts): AreaStats {
  return {
    inbox: counts.unread === 0 ? "Nothing waiting" : `${getPlural(counts.unread, "message waits", "messages wait")} for you`,
    notifications: counts.activeRecipients === 0 ? "Nobody gets alerts yet" : `${getPlural(counts.activeRecipients, "person gets", "people get")} alerts`,
    listings: `${counts.liveListings} live · ${getPlural(counts.draftListings, "draft", "drafts")}`,
    team: `${counts.shownMembers} shown · ${counts.hiddenMembers} hidden`,
    contact: "Used on every page",
    "chat-policy": counts.policySummary,
    chats: `${getPlural(counts.weekChats, "chat", "chats")} in 7 days`,
    "closed-deals": `${getPlural(counts.closedDeals, "closed deal", "closed deals")} recorded`,
    tracking: counts.trackingSummary,
    trash: getPlural(counts.trashItems, "item", "items"),
    users: `${getPlural(counts.people, "person has", "people have")} access`,
  };
}

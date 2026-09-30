// Wording for the dashboard: greeting, the "Today" strip, and each area card's status line.
// Pure functions of the counts, so they are tested without a database. A count that didn't
// load is null and shows as "—", never as 0 (docs/cwr-error-tracking-plan.md).

import type { LoadResult } from "@/lib/admin/load-result";

const OFFICE_TIME_ZONE = "America/New_York";
const MORNING_ENDS_HOUR = 12;
const AFTERNOON_ENDS_HOUR = 17;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const INBOX_PATH = "/admin/inbox";
export const MISSING_FIGURE = "—";
const NOT_LOADED_DETAIL = "Didn't load — refresh to try again";

const HOUR_FORMAT = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: OFFICE_TIME_ZONE });
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: OFFICE_TIME_ZONE });

/** null: that count didn't load. */
type Count = number | null;

export type EditorCounts = {
  unread: Count;
  oldestNewAt: LoadResult<string | null>;
  activeRecipients: Count;
  liveListings: Count;
  draftListings: Count;
  shownMembers: Count;
  hiddenMembers: Count;
  trashItems: Count;
  people: Count;
  weekChats: Count;
  policySummary: string | null;
  closedDeals: Count;
  trackingSummary: string | null;
};

export type StaffCounts = { waitingReply: Count; assignedOpen: Count };

/** value is null when the figure didn't load; it is shown as "—". */
export type TodayFigure = { key: string; value: Count; label: string; detail: string; href: string; isActionNeeded: boolean };

export type AreaStats = Record<string, string>;

function getPlural(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getElapsedText(elapsedMs: number): string {
  if (elapsedMs < HOUR_MS) return getPlural(Math.max(1, Math.floor(elapsedMs / MINUTE_MS)), "minute", "minutes");
  if (elapsedMs < DAY_MS) return getPlural(Math.floor(elapsedMs / HOUR_MS), "hour", "hours");
  return getPlural(Math.floor(elapsedMs / DAY_MS), "day", "days");
}

function getLoadedText(count: Count, getText: (count: number) => string): string {
  return count === null ? MISSING_FIGURE : getText(count);
}

function getLoadedDetail(count: Count, getDetail: (count: number) => string): string {
  return count === null ? NOT_LOADED_DETAIL : getDetail(count);
}

function isPositive(count: Count): boolean {
  return count !== null && count > 0;
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

function getInboxDetail({ counts, now }: { counts: EditorCounts; now: Date }): string {
  if (counts.unread === null) return NOT_LOADED_DETAIL;
  if (!counts.oldestNewAt.isLoaded) return "Wait time didn't load";
  return getWaitingText({ oldestNewAt: counts.oldestNewAt.data, now });
}

/** Owners and managers: four figures; anything needing action is flagged (shown in gold). */
export function getEditorToday({ counts, now }: { counts: EditorCounts; now: Date }): TodayFigure[] {
  const hasNoRecipients = counts.activeRecipients === 0;
  return [
    { key: "inbox", value: counts.unread, label: "New messages", detail: getInboxDetail({ counts, now }), href: INBOX_PATH, isActionNeeded: isPositive(counts.unread) },
    {
      key: "listings",
      value: counts.liveListings,
      label: "Live listings",
      detail: getLoadedDetail(counts.draftListings, (drafts) => (drafts === 0 ? "No drafts waiting" : `${getPlural(drafts, "draft", "drafts")} not published`)),
      href: "/admin/listings",
      isActionNeeded: false,
    },
    { key: "chats", value: counts.weekChats, label: "Chats this week", detail: getLoadedDetail(counts.weekChats, () => "In the last 7 days"), href: "/admin/chats", isActionNeeded: false },
    {
      key: "notifications",
      value: counts.activeRecipients,
      label: "Alert recipients",
      detail: getLoadedDetail(counts.activeRecipients, (recipients) => (recipients > 0 ? "Get an email for every request" : "Nobody gets alerts yet")),
      href: "/admin/notifications",
      isActionNeeded: hasNoRecipients,
    },
  ];
}

/** Staff: only their own messages. */
export function getStaffToday(counts: StaffCounts): TodayFigure[] {
  return [
    { key: "waiting", value: counts.waitingReply, label: "Waiting on my reply", detail: getLoadedDetail(counts.waitingReply, () => "Assigned to you, not yet answered"), href: INBOX_PATH, isActionNeeded: isPositive(counts.waitingReply) },
    { key: "assigned", value: counts.assignedOpen, label: "Assigned to me", detail: getLoadedDetail(counts.assignedOpen, () => "Open messages you own"), href: INBOX_PATH, isActionNeeded: false },
  ];
}

function getPairText({ first, second, getText }: { first: Count; second: Count; getText: (first: number, second: number) => string }): string {
  if (first === null || second === null) return MISSING_FIGURE;
  return getText(first, second);
}

/** Short status line under each area card (Admin §1 "every editable area as a labeled card"). */
export function getAreaStats(counts: EditorCounts): AreaStats {
  return {
    inbox: getLoadedText(counts.unread, (unread) => (unread === 0 ? "Nothing waiting" : `${getPlural(unread, "message waits", "messages wait")} for you`)),
    notifications: getLoadedText(counts.activeRecipients, (recipients) => (recipients === 0 ? "Nobody gets alerts yet" : `${getPlural(recipients, "person gets", "people get")} alerts`)),
    listings: getPairText({ first: counts.liveListings, second: counts.draftListings, getText: (live, drafts) => `${live} live · ${getPlural(drafts, "draft", "drafts")}` }),
    team: getPairText({ first: counts.shownMembers, second: counts.hiddenMembers, getText: (shown, hidden) => `${shown} shown · ${hidden} hidden` }),
    contact: "Used on every page",
    "chat-policy": counts.policySummary ?? MISSING_FIGURE,
    chats: getLoadedText(counts.weekChats, (chats) => `${getPlural(chats, "chat", "chats")} in 7 days`),
    "closed-deals": getLoadedText(counts.closedDeals, (deals) => `${getPlural(deals, "closed deal", "closed deals")} recorded`),
    tracking: counts.trackingSummary ?? MISSING_FIGURE,
    trash: getLoadedText(counts.trashItems, (items) => getPlural(items, "item", "items")),
    users: getLoadedText(counts.people, (people) => `${getPlural(people, "person has", "people have")} access`),
  };
}

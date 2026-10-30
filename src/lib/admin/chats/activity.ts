import { MISSING_FIGURE } from "@/lib/admin/dashboard-figures";
import type { LoadResult } from "@/lib/admin/load-result";

// Chat history activity figures (owner request 2026-10-22): Chats, Answered rate, and Sent to
// the inbox for a span, each compared with the span before. Pure, so it is tested without a
// database; "This month" follows the office's calendar (Eastern time) across daylight saving.

const OFFICE_TIME_ZONE = "America/New_York";
const DAY_MS = 24 * 60 * 60 * 1000;
const PERCENT = 100;
const NOT_LOADED_DETAIL = "Didn't load — refresh to try again";
const SPAN_DAYS: Record<RollingSpan, number> = { "7": 7, "30": 30, "90": 90 };
const SPAN_PHRASES: Record<ActivitySpan, string> = { "7": "the previous 7 days", "30": "the previous 30 days", "90": "the previous 90 days", month: "the same days last month" };

const WALL_CLOCK_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: OFFICE_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

export type ActivitySpan = "7" | "30" | "90" | "month";

export const DEFAULT_ACTIVITY_SPAN: ActivitySpan = "7";

export const ACTIVITY_SPANS: { value: ActivitySpan; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "month", label: "This month" },
];

export type TimeRange = { from: Date; to: Date };

export type SpanRanges = { current: TimeRange; previous: TimeRange };

/** One span's counts, as cwr.chat_activity returns them. */
export type ActivityCounts = { chats: number; sentToInbox: number; typedReplies: number; typedAnswers: number };

export type ChatActivity = { current: ActivityCounts; previous: ActivityCounts };

export type ActivityFigure = { key: "chats" | "answered" | "inbox"; label: string; value: string; note: string; change: string };

type RollingSpan = Exclude<ActivitySpan, "month">;

/** The office's calendar date and time; month is 1–12. */
type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number };

export function getActivitySpan(rawSpan: string | undefined): ActivitySpan {
  return ACTIVITY_SPANS.find((span) => span.value === rawSpan)?.value ?? DEFAULT_ACTIVITY_SPAN;
}

export function getSpanRanges(span: ActivitySpan, now: Date): SpanRanges {
  if (span === "month") return getMonthRanges(now);
  const spanMs = SPAN_DAYS[span] * DAY_MS;
  const from = new Date(now.getTime() - spanMs);
  return { current: { from, to: now }, previous: { from: new Date(from.getTime() - spanMs), to: from } };
}

/** Whole-number percent of typed replies that answered; null when there were none. */
export function getAnsweredRate({ typedAnswers, typedReplies }: ActivityCounts): number | null {
  if (typedReplies === 0) return null;
  return Math.round((typedAnswers / typedReplies) * PERCENT);
}

export function getActivityFigures({ activity, span }: { activity: LoadResult<ChatActivity>; span: ActivitySpan }): ActivityFigure[] {
  if (!activity.isLoaded) return getNotLoadedFigures();
  const { current, previous } = activity.data;
  const phrase = SPAN_PHRASES[span];
  return [
    { key: "chats", label: "Chats", value: String(current.chats), note: "Conversations visitors started", change: getCountChange({ current: current.chats, previous: previous.chats, phrase }) },
    getAnsweredFigure({ current, previous, phrase }),
    { key: "inbox", label: "Sent to the inbox", value: String(current.sentToInbox), note: "Chats that became an inbox message", change: getCountChange({ current: current.sentToInbox, previous: previous.sentToInbox, phrase }) },
  ];
}

function getNotLoadedFigures(): ActivityFigure[] {
  return [
    { key: "chats", label: "Chats", value: MISSING_FIGURE, note: "Conversations visitors started", change: NOT_LOADED_DETAIL },
    { key: "answered", label: "Answered rate", value: MISSING_FIGURE, note: "Typed questions answered without handing off", change: NOT_LOADED_DETAIL },
    { key: "inbox", label: "Sent to the inbox", value: MISSING_FIGURE, note: "Chats that became an inbox message", change: NOT_LOADED_DETAIL },
  ];
}

function getAnsweredFigure({ current, previous, phrase }: { current: ActivityCounts; previous: ActivityCounts; phrase: string }): ActivityFigure {
  const rate = getAnsweredRate(current);
  const previousRate = getAnsweredRate(previous);
  const figure = { key: "answered" as const, label: "Answered rate", note: "Typed questions answered without handing off" };
  if (rate === null) return { ...figure, value: MISSING_FIGURE, change: "No typed questions" };
  if (previousRate === null) return { ...figure, value: `${rate}%`, change: `No typed questions in ${phrase}` };
  return { ...figure, value: `${rate}%`, change: getPointsChange({ current: rate, previous: previousRate, phrase }) };
}

function getCountChange({ current, previous, phrase }: { current: number; previous: number; phrase: string }): string {
  const difference = current - previous;
  if (difference > 0) return `Up ${difference} from ${phrase}`;
  if (difference < 0) return `Down ${-difference} from ${phrase}`;
  return `Same as ${phrase}`;
}

function getPointsChange({ current, previous, phrase }: { current: number; previous: number; phrase: string }): string {
  const difference = current - previous;
  const points = (count: number) => (count === 1 ? "1 point" : `${count} points`);
  if (difference > 0) return `Up ${points(difference)} from ${phrase}`;
  if (difference < 0) return `Down ${points(-difference)} from ${phrase}`;
  return `Same as ${phrase}`;
}

/** This month so far, and last month up to the same day and time (or all of it, when shorter). */
function getMonthRanges(now: Date): SpanRanges {
  const today = getOfficeWallClock(now);
  const monthStart = getOfficeInstant({ ...today, day: 1, hour: 0, minute: 0, second: 0 });
  const lastMonth = today.month === 1 ? { year: today.year - 1, month: 12 } : { year: today.year, month: today.month - 1 };
  const lastMonthStart = getOfficeInstant({ ...lastMonth, day: 1, hour: 0, minute: 0, second: 0 });
  const isPastLastMonthEnd = today.day > getDaysInMonth(lastMonth);
  const lastMonthTo = isPastLastMonthEnd ? monthStart : getOfficeInstant({ ...today, ...lastMonth });
  return { current: { from: monthStart, to: now }, previous: { from: lastMonthStart, to: lastMonthTo } };
}

function getDaysInMonth({ year, month }: { year: number; month: number }): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getOfficeWallClock(date: Date): WallClock {
  const parts = WALL_CLOCK_FORMAT.formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: getPart("year"), month: getPart("month"), day: getPart("day"), hour: getPart("hour"), minute: getPart("minute"), second: getPart("second") };
}

/** The instant the office's clock shows `wallClock`. Checked twice because the guess can land
 * on the other side of a daylight-saving change from the answer. */
function getOfficeInstant(wallClock: WallClock): Date {
  const wallClockAsUtc = Date.UTC(wallClock.year, wallClock.month - 1, wallClock.day, wallClock.hour, wallClock.minute, wallClock.second);
  const firstGuess = wallClockAsUtc - getOfficeOffsetMs(new Date(wallClockAsUtc));
  return new Date(wallClockAsUtc - getOfficeOffsetMs(new Date(firstGuess)));
}

/** How far the office's clock is ahead of UTC at `date` (negative: behind). */
function getOfficeOffsetMs(date: Date): number {
  const wallClock = getOfficeWallClock(date);
  const wallClockAsUtc = Date.UTC(wallClock.year, wallClock.month - 1, wallClock.day, wallClock.hour, wallClock.minute, wallClock.second);
  return wallClockAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

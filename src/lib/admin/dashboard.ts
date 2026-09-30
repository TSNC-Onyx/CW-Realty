import "server-only";

import { getAreaStats, getEditorToday, getStaffToday, type AreaStats, type EditorCounts, type StaffCounts, type TodayFigure } from "@/lib/admin/dashboard-figures";
import { fetchOldestNewThreadDate, fetchUnreadCount } from "@/lib/admin/inbox/queries";
import { getLoaded, getLoadFailure, type LoadResult } from "@/lib/admin/load-result";
import type { AdminContext } from "@/lib/admin/require-admin";
import { isTagReviewDue } from "@/lib/admin/tracking/tag-review";

// Counts behind the dashboard, read through the signed-in session (RLS applies). Every read
// is kept as a LoadResult, so the page can record what failed and show "—" for it.

/** loads: every read behind the figures, for the page's single load report. */
export type DashboardSummary = { today: TodayFigure[]; areaStats: AreaStats; loads: LoadResult<unknown>[] };

type DatabaseError = { code?: string; message: string };

type CountQuery = PromiseLike<{ count: number | null; error: DatabaseError | null }>;

type PolicyRow = { version: number; status: string };

type TrackingRow = { gtm_container_id: string | null; tags_reviewed_at: string | null };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function getLoadedOrNull<Data>(result: LoadResult<Data>): Data | null {
  return result.isLoaded ? result.data : null;
}

async function fetchCount({ part, query }: { part: string; query: CountQuery }): Promise<LoadResult<number>> {
  const { count, error } = await query;
  if (error) return getLoadFailure(part, error);
  return getLoaded(count ?? 0);
}

function getPolicySummary(policies: PolicyRow[]): string {
  const live = policies.find((policy) => policy.status === "published");
  const hasNewerDraft = policies[0]?.status === "draft";
  const liveText = live ? `Version ${live.version} is live` : "Nothing published yet";
  return hasNewerDraft ? `${liveText} · a draft is waiting` : liveText;
}

async function fetchPolicySummary({ supabase, tenantId, role }: AdminContext): Promise<LoadResult<string>> {
  if (role !== "owner") return getLoaded("");
  const { data, error } = await supabase.from("chat_policies").select("version, status").eq("tenant_id", tenantId).neq("status", "archived").order("version", { ascending: false }).returns<PolicyRow[]>();
  if (error) return getLoadFailure("chat policy", error);
  return getLoaded(getPolicySummary(data ?? []));
}

function getTrackingSummary({ row, now }: { row: TrackingRow | null; now: Date }): string {
  if (!row?.gtm_container_id) return "Off — no tracking on the website";
  return isTagReviewDue({ reviewedAt: row.tags_reviewed_at, now }) ? "On · tag review due" : "On after visitors agree";
}

async function fetchTrackingSummary({ supabase, tenantId, role }: AdminContext, now: Date): Promise<LoadResult<string>> {
  if (role !== "owner") return getLoaded("");
  const { data, error } = await supabase.from("tracking_settings").select("gtm_container_id, tags_reviewed_at").eq("tenant_id", tenantId).maybeSingle<TrackingRow>();
  if (error) return getLoadFailure("tracking settings", error);
  return getLoaded(getTrackingSummary({ row: data, now }));
}

function fetchTableCounts({ supabase, tenantId }: AdminContext, now: Date) {
  const countOf = (table: string) => supabase.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  const weekAgo = new Date(now.getTime() - WEEK_MS).toISOString();
  return Promise.all([
    fetchCount({ part: "alert recipients", query: countOf("notification_recipients").eq("is_active", true) }),
    fetchCount({ part: "live listings", query: countOf("listings").is("deleted_at", null).eq("publish_state", "live") }),
    fetchCount({ part: "draft listings", query: countOf("listings").is("deleted_at", null).eq("publish_state", "draft") }),
    fetchCount({ part: "shown team members", query: countOf("team_members").is("deleted_at", null).eq("is_visible", true) }),
    fetchCount({ part: "hidden team members", query: countOf("team_members").is("deleted_at", null).eq("is_visible", false) }),
    fetchCount({ part: "trash", query: countOf("trash") }),
    fetchCount({ part: "people with access", query: countOf("memberships") }),
    fetchCount({ part: "chats this week", query: countOf("chat_sessions").gte("started_at", weekAgo) }),
    fetchCount({ part: "closed deals", query: countOf("closed_deals").is("deleted_at", null) }),
  ]);
}

type EditorLoads = {
  unread: LoadResult<number>;
  oldestNewAt: LoadResult<string | null>;
  policySummary: LoadResult<string>;
  trackingSummary: LoadResult<string>;
  tableCounts: Awaited<ReturnType<typeof fetchTableCounts>>;
};

function getEditorCounts({ unread, oldestNewAt, policySummary, trackingSummary, tableCounts }: EditorLoads): EditorCounts {
  const [activeRecipients, liveListings, draftListings, shownMembers, hiddenMembers, trashItems, people, weekChats, closedDeals] = tableCounts;
  return {
    unread: getLoadedOrNull(unread),
    oldestNewAt,
    policySummary: getLoadedOrNull(policySummary),
    trackingSummary: getLoadedOrNull(trackingSummary),
    activeRecipients: getLoadedOrNull(activeRecipients),
    liveListings: getLoadedOrNull(liveListings),
    draftListings: getLoadedOrNull(draftListings),
    shownMembers: getLoadedOrNull(shownMembers),
    hiddenMembers: getLoadedOrNull(hiddenMembers),
    trashItems: getLoadedOrNull(trashItems),
    people: getLoadedOrNull(people),
    weekChats: getLoadedOrNull(weekChats),
    closedDeals: getLoadedOrNull(closedDeals),
  };
}

async function fetchEditorCounts(admin: AdminContext, now: Date): Promise<{ counts: EditorCounts; loads: LoadResult<unknown>[] }> {
  const [unread, oldestNewAt, policySummary, trackingSummary, tableCounts] = await Promise.all([
    fetchUnreadCount(admin),
    fetchOldestNewThreadDate(admin),
    fetchPolicySummary(admin),
    fetchTrackingSummary(admin, now),
    fetchTableCounts(admin, now),
  ]);
  const counts = getEditorCounts({ unread, oldestNewAt, policySummary, trackingSummary, tableCounts });
  return { counts, loads: [unread, oldestNewAt, policySummary, trackingSummary, ...tableCounts] };
}

async function fetchStaffCounts(admin: AdminContext): Promise<{ counts: StaffCounts; loads: LoadResult<unknown>[] }> {
  const { supabase, tenantId, userId } = admin;
  const assignedOpenQuery = supabase.from("inbox_threads").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("assignee_id", userId).neq("status", "closed");
  const [waitingReply, assignedOpen] = await Promise.all([fetchUnreadCount(admin), fetchCount({ part: "assigned messages", query: assignedOpenQuery })]);
  return { counts: { waitingReply: getLoadedOrNull(waitingReply), assignedOpen: getLoadedOrNull(assignedOpen) }, loads: [waitingReply, assignedOpen] };
}

export async function fetchDashboardSummary(admin: AdminContext, now: Date): Promise<DashboardSummary> {
  if (admin.role === "staff") {
    const { counts, loads } = await fetchStaffCounts(admin);
    return { today: getStaffToday(counts), areaStats: {}, loads };
  }
  const { counts, loads } = await fetchEditorCounts(admin, now);
  return { today: getEditorToday({ counts, now }), areaStats: getAreaStats(counts), loads };
}

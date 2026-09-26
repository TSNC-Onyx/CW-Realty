import "server-only";

import { getAreaStats, getEditorToday, getStaffToday, type AreaStats, type EditorCounts, type StaffCounts, type TodayFigure } from "@/lib/admin/dashboard-figures";
import { fetchOldestNewThreadDate, fetchUnreadCount } from "@/lib/admin/inbox/queries";
import type { AdminContext } from "@/lib/admin/require-admin";

// Counts behind the dashboard, read through the signed-in session (RLS applies).

export type DashboardSummary = { today: TodayFigure[]; areaStats: AreaStats };

type CountQuery = PromiseLike<{ count: number | null }>;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function fetchCount(query: CountQuery): Promise<number> {
  const { count } = await query;
  return count ?? 0;
}

async function fetchPolicySummary({ supabase, tenantId, role }: AdminContext): Promise<string> {
  if (role !== "owner") return "";
  const { data } = await supabase.from("chat_policies").select("version, status").eq("tenant_id", tenantId).neq("status", "archived").order("version", { ascending: false }).returns<{ version: number; status: string }[]>();
  const live = data?.find((policy) => policy.status === "published");
  const hasNewerDraft = data?.[0]?.status === "draft";
  const liveText = live ? `Version ${live.version} is live` : "Nothing published yet";
  return hasNewerDraft ? `${liveText} · a draft is waiting` : liveText;
}

async function fetchEditorCounts(admin: AdminContext, now: Date): Promise<EditorCounts> {
  const { supabase, tenantId } = admin;
  const countOf = (table: string) => supabase.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  const weekAgo = new Date(now.getTime() - WEEK_MS).toISOString();
  const [unread, oldestNewAt, activeRecipients, liveListings, draftListings, shownMembers, hiddenMembers, trashItems, people, weekChats, policySummary] = await Promise.all([
    fetchUnreadCount(admin),
    fetchOldestNewThreadDate(admin),
    fetchCount(countOf("notification_recipients").eq("is_active", true)),
    fetchCount(countOf("listings").is("deleted_at", null).eq("publish_state", "live")),
    fetchCount(countOf("listings").is("deleted_at", null).eq("publish_state", "draft")),
    fetchCount(countOf("team_members").is("deleted_at", null).eq("is_visible", true)),
    fetchCount(countOf("team_members").is("deleted_at", null).eq("is_visible", false)),
    fetchCount(countOf("trash")),
    fetchCount(countOf("memberships")),
    fetchCount(countOf("chat_sessions").gte("started_at", weekAgo)),
    fetchPolicySummary(admin),
  ]);
  return { unread, oldestNewAt, activeRecipients, liveListings, draftListings, shownMembers, hiddenMembers, trashItems, people, weekChats, policySummary };
}

async function fetchStaffCounts(admin: AdminContext): Promise<StaffCounts> {
  const { supabase, tenantId, userId } = admin;
  const assignedOpenQuery = supabase.from("inbox_threads").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("assignee_id", userId).neq("status", "closed");
  const [waitingReply, assignedOpen] = await Promise.all([fetchUnreadCount(admin), fetchCount(assignedOpenQuery)]);
  return { waitingReply, assignedOpen };
}

export async function fetchDashboardSummary(admin: AdminContext, now: Date): Promise<DashboardSummary> {
  if (admin.role === "staff") return { today: getStaffToday(await fetchStaffCounts(admin)), areaStats: {} };
  const counts = await fetchEditorCounts(admin, now);
  return { today: getEditorToday({ counts, now }), areaStats: getAreaStats(counts) };
}

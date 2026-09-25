import "server-only";

import { fetchUnreadCount } from "@/lib/admin/inbox/queries";
import type { AdminContext } from "@/lib/admin/require-admin";

// Short status lines for the dashboard cards (Admin §1 "every editable area as a labeled card").

export type DashboardStats = Record<string, string>;

type CountQuery = PromiseLike<{ count: number | null }>;

async function fetchCount(query: CountQuery): Promise<number> {
  const { count } = await query;
  return count ?? 0;
}

function getPlural(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function fetchPolicySummary({ supabase, tenantId, role }: AdminContext): Promise<string> {
  if (role !== "owner") return "";
  const { data } = await supabase.from("chat_policies").select("version, status").eq("tenant_id", tenantId).neq("status", "archived").order("version", { ascending: false }).returns<{ version: number; status: string }[]>();
  const live = data?.find((policy) => policy.status === "published");
  const hasNewerDraft = data?.[0]?.status === "draft";
  const liveText = live ? `Version ${live.version} is live` : "Nothing published yet";
  return hasNewerDraft ? `${liveText} · a draft is waiting` : liveText;
}

export async function fetchDashboardStats(admin: AdminContext): Promise<DashboardStats> {
  const { supabase, tenantId } = admin;
  const countOf = (table: string) => supabase.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  const weekAgo = new Date(Date.now() - WEEK_MS).toISOString();
  const [unread, activeRecipients, liveListings, draftListings, shownMembers, hiddenMembers, trashItems, people, weekChats, policySummary] = await Promise.all([
    fetchUnreadCount(admin),
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
  return {
    inbox: unread === 0 ? "Nothing waiting" : `${getPlural(unread, "message waits", "messages wait")} for you`,
    notifications: activeRecipients === 0 ? "Nobody gets alerts yet" : `${getPlural(activeRecipients, "person gets", "people get")} alerts`,
    listings: `${getPlural(liveListings, "listing", "listings")} on the website · ${getPlural(draftListings, "draft", "drafts")}`,
    team: `${getPlural(shownMembers, "person", "people")} shown · ${hiddenMembers} hidden`,
    contact: "Used in the header, footer, and Contact page",
    "chat-policy": policySummary,
    chats: `${getPlural(weekChats, "chat", "chats")} in the last 7 days`,
    trash: getPlural(trashItems, "item", "items"),
    users: getPlural(people, "person has", "people have") + " access",
  };
}

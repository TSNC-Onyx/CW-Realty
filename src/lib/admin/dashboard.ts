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

export async function fetchDashboardStats(admin: AdminContext): Promise<DashboardStats> {
  const { supabase, tenantId } = admin;
  const countOf = (table: string) => supabase.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  const [unread, activeRecipients, liveListings, draftListings, shownMembers, hiddenMembers, trashItems, people] = await Promise.all([
    fetchUnreadCount(admin),
    fetchCount(countOf("notification_recipients").eq("is_active", true)),
    fetchCount(countOf("listings").is("deleted_at", null).eq("publish_state", "live")),
    fetchCount(countOf("listings").is("deleted_at", null).eq("publish_state", "draft")),
    fetchCount(countOf("team_members").is("deleted_at", null).eq("is_visible", true)),
    fetchCount(countOf("team_members").is("deleted_at", null).eq("is_visible", false)),
    fetchCount(countOf("trash")),
    fetchCount(countOf("memberships")),
  ]);
  return {
    inbox: unread === 0 ? "Nothing waiting" : `${getPlural(unread, "message waits", "messages wait")} for you`,
    notifications: activeRecipients === 0 ? "Nobody gets alerts yet" : `${getPlural(activeRecipients, "person gets", "people get")} alerts`,
    listings: `${getPlural(liveListings, "listing", "listings")} on the website · ${getPlural(draftListings, "draft", "drafts")}`,
    team: `${getPlural(shownMembers, "person", "people")} shown · ${hiddenMembers} hidden`,
    contact: "Used in the header, footer, and Contact page",
    trash: getPlural(trashItems, "item", "items"),
    users: getPlural(people, "person has", "people have") + " access",
  };
}

import "server-only";

import type { InboxFilter, InboxSource, InboxStatus } from "@/lib/admin/inbox/inbox-labels";
import type { AdminContext, AdminRole } from "@/lib/admin/require-admin";
import { createServiceClient, isServiceAccessConfigured } from "@/lib/supabase/service-client";

// Inbox reads through the signed-in session: Row Level Security shows staff only the
// threads assigned to them (Admin §7 "each sees only what it needs").

export const INBOX_PAGE_SIZE = 25;
const MAX_TEAMMATES = 1000;
const UNKNOWN_TEAMMATE_LABEL = "Team member";

export type InboxThreadSummary = {
  id: string;
  source: InboxSource;
  status: InboxStatus;
  contact_name: string;
  subject: string;
  assignee_id: string | null;
  created_at: string;
};

export type InboxMessage = { id: string; kind: "inbound" | "reply" | "internal_note"; body: string; author_id: string | null; created_at: string };

export type InboxThread = InboxThreadSummary & { contact_email: string | null; contact_phone: string | null; inbox_messages: InboxMessage[] };

export type Teammate = { userId: string; label: string; role: AdminRole };

const SUMMARY_COLUMNS = "id, source, status, contact_name, subject, assignee_id, created_at";

export async function fetchInboxPage({ supabase, tenantId }: AdminContext, { filter, page }: { filter: InboxFilter; page: number }) {
  const from = (page - 1) * INBOX_PAGE_SIZE;
  const base = supabase.from("inbox_threads").select(SUMMARY_COLUMNS, { count: "exact" }).eq("tenant_id", tenantId);
  const filtered = filter === "open" ? base.neq("status", "closed") : base.eq("status", filter);
  const { data, count } = await filtered.order("created_at", { ascending: false }).range(from, from + INBOX_PAGE_SIZE - 1).returns<InboxThreadSummary[]>();
  return { threads: data ?? [], totalCount: count ?? 0 };
}

export async function fetchInboxThread({ supabase, tenantId }: AdminContext, id: string): Promise<InboxThread | null> {
  const { data } = await supabase
    .from("inbox_threads")
    .select(`${SUMMARY_COLUMNS}, contact_email, contact_phone, inbox_messages(id, kind, body, author_id, created_at)`)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle<InboxThread>();
  if (!data) return null;
  return { ...data, inbox_messages: [...data.inbox_messages].sort((first, second) => first.created_at.localeCompare(second.created_at)) };
}

/** The newest open requests the signed-in person can see (RLS limits staff to their own). */
export async function fetchLatestThreads({ supabase, tenantId }: AdminContext, limit: number): Promise<InboxThreadSummary[]> {
  const { data } = await supabase
    .from("inbox_threads")
    .select(SUMMARY_COLUMNS)
    .eq("tenant_id", tenantId)
    .neq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<InboxThreadSummary[]>();
  return data ?? [];
}

/** When the longest-waiting new request arrived, or null when nothing is waiting. */
export async function fetchOldestNewThreadDate({ supabase, tenantId }: AdminContext): Promise<string | null> {
  const { data } = await supabase
    .from("inbox_threads")
    .select("created_at")
    .eq("tenant_id", tenantId)
    .eq("status", "new")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ created_at: string }>();
  return data?.created_at ?? null;
}

/** Unread: new requests for owners and managers; for staff, requests assigned to them and not yet answered. */
export async function fetchUnreadCount({ supabase, tenantId, role, userId }: AdminContext): Promise<number> {
  const base = supabase.from("inbox_threads").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  const query = role === "staff" ? base.eq("status", "assigned").eq("assignee_id", userId) : base.eq("status", "new");
  const { count } = await query;
  return count ?? 0;
}

/** Sign-in emails by user ID; empty when the service-role secret is missing, so pages still load. */
async function fetchUserEmails(): Promise<Map<string, string>> {
  if (!isServiceAccessConfigured()) return new Map();
  const { data } = await createServiceClient().auth.admin.listUsers({ page: 1, perPage: MAX_TEAMMATES });
  return new Map((data?.users ?? []).map((user) => [user.id, user.email ?? UNKNOWN_TEAMMATE_LABEL]));
}

/** Everyone with access, labeled by email, for assigning and for naming note authors. */
export async function fetchTeammates({ supabase, tenantId }: AdminContext): Promise<Teammate[]> {
  const { data: memberships } = await supabase.from("memberships").select("user_id, role").eq("tenant_id", tenantId).returns<{ user_id: string; role: AdminRole }[]>();
  const emails = await fetchUserEmails();
  return (memberships ?? []).map((membership) => ({ userId: membership.user_id, label: emails.get(membership.user_id) ?? UNKNOWN_TEAMMATE_LABEL, role: membership.role }));
}

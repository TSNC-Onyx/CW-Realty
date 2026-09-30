import "server-only";

import type { InboxSource } from "@/lib/admin/inbox/inbox-labels";
import { getQueryLoad, type LoadResult } from "@/lib/admin/load-result";
import type { AdminContext } from "@/lib/admin/require-admin";

// Alert recipients and the delivery log (Admin §5, Infra §3 dead-letter visibility).

const RECENT_DELIVERIES = 50;
const MAX_RECIPIENTS = 100;

export type Recipient = { id: string; full_name: string; email: string; alert_sources: InboxSource[]; is_active: boolean; gets_problem_alerts: boolean };

export type Delivery = {
  id: string;
  kind: "new_request" | "visitor_copy" | "reply" | "test" | "problem";
  recipient_email: string;
  status: "pending" | "sending" | "sent" | "failed" | "not_sent";
  attempts: number;
  last_error: string | null;
  created_at: string;
};

export async function fetchRecipients({ supabase, tenantId }: AdminContext): Promise<LoadResult<Recipient[]>> {
  const result = await supabase
    .from("notification_recipients")
    .select("id, full_name, email, alert_sources, is_active, gets_problem_alerts")
    .eq("tenant_id", tenantId)
    .order("full_name")
    .limit(MAX_RECIPIENTS)
    .returns<Recipient[]>();
  return getQueryLoad({ part: "alert recipients", result, empty: [] });
}

export async function fetchRecentDeliveries({ supabase, tenantId }: AdminContext): Promise<LoadResult<Delivery[]>> {
  const result = await supabase
    .from("alert_deliveries")
    .select("id, kind, recipient_email, status, attempts, last_error, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(RECENT_DELIVERIES)
    .returns<Delivery[]>();
  return getQueryLoad({ part: "email log", result, empty: [] });
}

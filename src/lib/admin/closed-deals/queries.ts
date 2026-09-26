import "server-only";

import type { AdminContext } from "@/lib/admin/require-admin";

// Closed deals with the lead's contact details and ad attribution (owners and managers by RLS).

const MAX_CLOSED_DEALS = 500;

const CLOSED_DEAL_COLUMNS =
  "id, thread_id, closed_on, value_cents, inbox_threads!inner(contact_name, contact_email, contact_phone, created_at, lead_attribution(gclid, gbraid, wbraid, fbc, fbp))";

export type DealAttribution = { gclid: string | null; gbraid: string | null; wbraid: string | null; fbc: string | null; fbp: string | null };

export type ClosedDeal = {
  id: string;
  threadId: string;
  closedOn: string;
  valueCents: number | null;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  leadCreatedAt: string;
  /** Present only when the visitor allowed Advertising; only these deals are exported. */
  attribution: DealAttribution | null;
};

type ClosedDealRow = {
  id: string;
  thread_id: string;
  closed_on: string;
  value_cents: number | null;
  inbox_threads: {
    contact_name: string;
    contact_email: string | null;
    contact_phone: string | null;
    created_at: string;
    lead_attribution: DealAttribution | DealAttribution[] | null;
  };
};

// PostgREST returns a one-to-one relation as an object, older versions as a one-item list.
function getAttribution(value: DealAttribution | DealAttribution[] | null): DealAttribution | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function getClosedDeal(row: ClosedDealRow): ClosedDeal {
  return {
    id: row.id,
    threadId: row.thread_id,
    closedOn: row.closed_on,
    valueCents: row.value_cents,
    contactName: row.inbox_threads.contact_name,
    contactEmail: row.inbox_threads.contact_email,
    contactPhone: row.inbox_threads.contact_phone,
    leadCreatedAt: row.inbox_threads.created_at,
    attribution: getAttribution(row.inbox_threads.lead_attribution),
  };
}

export async function fetchClosedDeals({ supabase, tenantId }: AdminContext): Promise<ClosedDeal[]> {
  const { data } = await supabase
    .from("closed_deals")
    .select(CLOSED_DEAL_COLUMNS)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("closed_on", { ascending: false })
    .limit(MAX_CLOSED_DEALS)
    .returns<ClosedDealRow[]>();
  return (data ?? []).map(getClosedDeal);
}

export type ThreadClosedDeal = { id: string; closedOn: string; valueCents: number | null };

export async function fetchThreadClosedDeal({ supabase, tenantId }: AdminContext, threadId: string): Promise<ThreadClosedDeal | null> {
  const { data } = await supabase
    .from("closed_deals")
    .select("id, closed_on, value_cents")
    .eq("tenant_id", tenantId)
    .eq("thread_id", threadId)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; closed_on: string; value_cents: number | null }>();
  return data ? { id: data.id, closedOn: data.closed_on, valueCents: data.value_cents } : null;
}

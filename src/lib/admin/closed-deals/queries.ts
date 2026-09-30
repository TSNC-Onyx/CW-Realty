import "server-only";

import { getLoaded, getLoadFailure, type LoadResult } from "@/lib/admin/load-result";
import type { AdminContext } from "@/lib/admin/require-admin";

// Closed deals with the lead's contact details and ad attribution (owners and managers by RLS).
// A failed read is a LoadResult failure, never an empty list or an empty download file.

// Read in pages so the list and the downloads always include every deal (Infra §5).
const PAGE_SIZE = 500;

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

async function fetchClosedDealPage({ supabase, tenantId }: AdminContext, pageIndex: number): Promise<LoadResult<ClosedDealRow[]>> {
  const from = pageIndex * PAGE_SIZE;
  const { data, error } = await supabase
    .from("closed_deals")
    .select(CLOSED_DEAL_COLUMNS)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("closed_on", { ascending: false })
    .order("id")
    .range(from, from + PAGE_SIZE - 1)
    .returns<ClosedDealRow[]>();
  if (error) return getLoadFailure("closed deals", error);
  return getLoaded(data ?? []);
}

export async function fetchClosedDeals(admin: AdminContext): Promise<LoadResult<ClosedDeal[]>> {
  const rows: ClosedDealRow[] = [];
  for (let pageIndex = 0; ; pageIndex += 1) {
    const page = await fetchClosedDealPage(admin, pageIndex);
    if (!page.isLoaded) return page;
    rows.push(...page.data);
    if (page.data.length < PAGE_SIZE) return getLoaded(rows.map(getClosedDeal));
  }
}

export type ThreadClosedDeal = { id: string; closedOn: string; valueCents: number | null };

/** null data: no deal recorded on this conversation. */
export async function fetchThreadClosedDeal({ supabase, tenantId }: AdminContext, threadId: string): Promise<LoadResult<ThreadClosedDeal | null>> {
  const { data, error } = await supabase
    .from("closed_deals")
    .select("id, closed_on, value_cents")
    .eq("tenant_id", tenantId)
    .eq("thread_id", threadId)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; closed_on: string; value_cents: number | null }>();
  if (error) return getLoadFailure("closed deal", error);
  return getLoaded(data ? { id: data.id, closedOn: data.closed_on, valueCents: data.value_cents } : null);
}

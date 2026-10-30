import "server-only";

import type { HealthCheck } from "@/lib/admin/health/health-notices";
import { getLoaded, getLoadFailure, getQueryLoad, type LoadResult } from "@/lib/admin/load-result";
import type { AdminContext } from "@/lib/admin/require-admin";

// Owner-only reads for the dashboard: background check stamps and problem-email recipients,
// through the owner's own session (RLS: owners only).

/**
 * problemRecipientCount: active recipients an owner chose for problem emails (owner decision D4).
 * isOutboxLive: problem emails go out only through the email outbox (docs/cwr-email-outbox-plan.md).
 */
export type OwnerHealth = { checks: LoadResult<HealthCheck[]>; problemRecipientCount: LoadResult<number>; isOutboxLive: boolean };

async function fetchHealthChecks({ supabase, tenantId }: AdminContext): Promise<LoadResult<HealthCheck[]>> {
  const result = await supabase.from("health_checks").select("name, last_run_at, last_ok_at, last_error, last_error_at, created_at").eq("tenant_id", tenantId).returns<HealthCheck[]>();
  return getQueryLoad({ part: "background checks", result, empty: [] });
}

async function fetchProblemRecipientCount({ supabase, tenantId }: AdminContext): Promise<LoadResult<number>> {
  const { count, error } = await supabase.from("notification_recipients").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true).eq("gets_problem_alerts", true);
  if (error) return getLoadFailure("problem-email recipients", error);
  return getLoaded(count ?? 0);
}

/** null for managers and staff: only owners see how the site itself is doing. */
export async function fetchOwnerHealth(admin: AdminContext): Promise<OwnerHealth | null> {
  if (admin.role !== "owner") return null;
  const [checks, problemRecipientCount, live] = await Promise.all([
    fetchHealthChecks(admin),
    fetchProblemRecipientCount(admin),
    admin.supabase.rpc("is_email_outbox_live", { p_tenant_id: admin.tenantId }),
  ]);
  // If the switch can't be read, the dashboard keeps the safe "paused" wording.
  return { checks, problemRecipientCount, isOutboxLive: !live.error && live.data === true };
}

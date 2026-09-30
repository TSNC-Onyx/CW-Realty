import "server-only";

import type { HealthCheck } from "@/lib/admin/health/health-notices";
import { getLoaded, getLoadFailure, getQueryLoad, type LoadResult } from "@/lib/admin/load-result";
import type { AdminContext } from "@/lib/admin/require-admin";

// Owner-only reads for the dashboard: background check stamps and the last day's problem
// count, through the owner's own session (RLS: owners only).

const DAY_MS = 24 * 60 * 60 * 1000;
const SERIOUS_SEVERITIES = ["error", "critical"];

/** serious: how many were errors or worse. */
export type ProblemCounts = { total: number; serious: number };

/** problemRecipientCount: active recipients an owner chose for problem emails (owner decision D4). */
export type OwnerHealth = { checks: LoadResult<HealthCheck[]>; problemCounts: LoadResult<ProblemCounts>; problemRecipientCount: LoadResult<number> };

async function fetchHealthChecks({ supabase, tenantId }: AdminContext): Promise<LoadResult<HealthCheck[]>> {
  const result = await supabase.from("health_checks").select("name, last_run_at, last_ok_at, last_error, last_error_at, created_at").eq("tenant_id", tenantId).returns<HealthCheck[]>();
  return getQueryLoad({ part: "background checks", result, empty: [] });
}

async function fetchProblemCounts({ supabase, tenantId }: AdminContext, now: Date): Promise<LoadResult<ProblemCounts>> {
  const dayAgo = new Date(now.getTime() - DAY_MS).toISOString();
  const countSince = () => supabase.from("problem_events").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("occurred_at", dayAgo);
  const [all, serious] = await Promise.all([countSince(), countSince().in("severity", SERIOUS_SEVERITIES)]);
  const error = all.error ?? serious.error;
  if (error) return getLoadFailure("problems in the last 24 hours", error);
  return getLoaded({ total: all.count ?? 0, serious: serious.count ?? 0 });
}

async function fetchProblemRecipientCount({ supabase, tenantId }: AdminContext): Promise<LoadResult<number>> {
  const { count, error } = await supabase.from("notification_recipients").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true).eq("gets_problem_alerts", true);
  if (error) return getLoadFailure("problem-email recipients", error);
  return getLoaded(count ?? 0);
}

/** null for managers and staff: only owners see how the site itself is doing. */
export async function fetchOwnerHealth(admin: AdminContext, now: Date): Promise<OwnerHealth | null> {
  if (admin.role !== "owner") return null;
  const [checks, problemCounts, problemRecipientCount] = await Promise.all([fetchHealthChecks(admin), fetchProblemCounts(admin, now), fetchProblemRecipientCount(admin)]);
  return { checks, problemCounts, problemRecipientCount };
}

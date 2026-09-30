import "server-only";

import { getLoadFailures, type LoadResult } from "@/lib/admin/load-result";
import type { AdminContext } from "@/lib/admin/require-admin";
import type { ProblemAction } from "@/lib/observability/problem-catalog";
import { reportProblem } from "@/lib/observability/report-problem";

// Records every part of a page that failed to load as ONE problem, so a database outage adds
// one short wait to the page, not one per query.

export type LoadProblemNotice = { reference: string; isStored: boolean };

export async function reportPageLoad({ admin, action, results }: { admin: AdminContext; action: ProblemAction; results: LoadResult<unknown>[] }): Promise<LoadProblemNotice | null> {
  const failures = getLoadFailures(results);
  if (failures.length === 0) return null;
  const result = await reportProblem({
    action,
    stage: "load",
    severity: "error",
    code: failures[0]?.code ?? "load",
    detail: failures.map((failure) => `${failure.part}: ${failure.code ?? ""} ${failure.detail ?? ""}`.trim()).join("\n"),
    shownMessage: "This part didn't load.",
    tenantId: admin.tenantId,
    actorId: admin.userId,
    actorRole: admin.role,
  });
  return { reference: result.reference, isStored: result.stored === true };
}

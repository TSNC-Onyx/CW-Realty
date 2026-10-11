import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";

import type { AdminContext } from "@/lib/admin/require-admin";
import { reportProblem } from "@/lib/observability/report-problem";

// Records a signed-in member opening an admin page that isn't there (docs/cwr-error-tracking-plan.md:
// "admin 404 ... recorded for signed-in members only", info, path only). Recorded where the
// miss happens, never by the shared "not found" screen: Next.js builds that screen into every
// render, including after a save, so recording there logged a miss for every save
// (docs/false-alarm-cleanup-plan.md). Once per request.

const NOT_FOUND_CODE = "page_not_found";

// One per request, in case a page records and then reaches another miss.
const getRequestRecord = cache((): { isRecorded: boolean } => ({ isRecorded: false }));

export async function recordPageNotFound({ admin, path }: { admin: AdminContext; path: string }): Promise<void> {
  const record = getRequestRecord();
  if (record.isRecorded) return;
  record.isRecorded = true;
  await reportProblem({
    action: "portal.page_not_found",
    stage: "not_found",
    severity: "info",
    code: NOT_FOUND_CODE,
    pagePath: path,
    tenantId: admin.tenantId,
    actorId: admin.userId,
    actorRole: admin.role,
  });
}

/** For pages whose item or page number isn't there: records the address, then shows "not found". */
export async function showPageNotFound({ admin, path }: { admin: AdminContext; path: string }): Promise<never> {
  await recordPageNotFound({ admin, path });
  notFound();
}

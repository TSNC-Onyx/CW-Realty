import "server-only";

import { cache } from "react";

import type { AdminContext } from "@/lib/admin/require-admin";
import { reportProblem } from "@/lib/observability/report-problem";

// Records a signed-in member opening an admin page that isn't there (docs/cwr-error-tracking-plan.md:
// "admin 404 ... recorded for signed-in members only", info, path only). The unknown-URL page
// records first, with the path; the shared "not found" screen then records only what it
// didn't, such as a link to an item that no longer exists. Once per request either way.

const NOT_FOUND_CODE = "page_not_found";

// One per request: shared by the page that called notFound() and the not-found screen.
const getRequestRecord = cache((): { isRecorded: boolean } => ({ isRecorded: false }));

export async function recordPageNotFound({ admin, path }: { admin: AdminContext; path: string | null }): Promise<void> {
  const record = getRequestRecord();
  if (record.isRecorded) return;
  record.isRecorded = true;
  await reportProblem({
    action: "portal.page_not_found",
    stage: "not_found",
    severity: "info",
    code: NOT_FOUND_CODE,
    pagePath: path,
    detail: path ? null : "Opened a link to an item that isn't there",
    tenantId: admin.tenantId,
    actorId: admin.userId,
    actorRole: admin.role,
  });
}

import { unstable_rethrow } from "next/navigation";

import { fetchClosedDeals } from "@/lib/admin/closed-deals/queries";
import { getUnexpectedCause } from "@/lib/admin/report-action-failure";
import { AdminAccessError, EDITOR_ROLES, requireAdmin } from "@/lib/admin/require-admin";
import { runInActionContext, type ProblemCause } from "@/lib/observability/action-context";
import { getReferenceSuffix } from "@/lib/observability/reference";
import { reportProblem } from "@/lib/observability/report-problem";
import { ReportedProblemError } from "@/lib/observability/reported-problem-error";
import { getGoogleAdsCsv, getMetaCsv, type ExportDeal } from "@/lib/tracking/offline-export";

// Closed-deal files for Google Ads and Meta (plan decision 11); owners and managers only.
// A failed read is a plain error page with a reference code, never an empty file.

const EXPORT_ACTION = "closed_deals.export";
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVER_ERROR = 500;
const WRONG_ROLE_MESSAGE = "Your role cannot download closed deals.";
const EXPORT_FAILED_MESSAGE = "The download didn't work. Try again in a moment.";
const TEXT_HEADERS = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };

type CsvExport = { fileName: string; getCsv: (deals: ExportDeal[]) => Promise<string> };

const EXPORTS: Record<string, CsvExport> = {
  "google-ads": { fileName: "cwr-closed-deals-google-ads.csv", getCsv: getGoogleAdsCsv },
  meta: { fileName: "cwr-closed-deals-meta.csv", getCsv: getMetaCsv },
};

function getTextResponse(message: string, status: number): Response {
  return new Response(message, { status, headers: TEXT_HEADERS });
}

async function getReportedResponse({ cause, message, status }: { cause: Omit<ProblemCause, "reference">; message: string; status: number }): Promise<Response> {
  const result = await reportProblem({ action: EXPORT_ACTION, ...cause, shownMessage: message });
  return getTextResponse(`${message}${getReferenceSuffix({ reference: result.reference, isStored: result.stored === true })}`, status);
}

async function getExportResponse(csvExport: CsvExport): Promise<Response> {
  const deals = await fetchClosedDeals(await requireAdmin(EDITOR_ROLES));
  if (!deals.isLoaded) {
    const cause = { stage: "load", severity: "error", code: deals.failure.code ?? "load", detail: deals.failure.detail } as const;
    return getReportedResponse({ cause, message: EXPORT_FAILED_MESSAGE, status: HTTP_SERVER_ERROR });
  }
  return new Response(await csvExport.getCsv(deals.data), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvExport.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

async function getFailureResponse(error: unknown): Promise<Response> {
  if (error instanceof ReportedProblemError) return getTextResponse(error.message, HTTP_SERVER_ERROR);
  if (error instanceof AdminAccessError) {
    const cause = { stage: "access", severity: "warning", code: "wrong_role", detail: null } as const;
    return getReportedResponse({ cause, message: WRONG_ROLE_MESSAGE, status: HTTP_FORBIDDEN });
  }
  return getReportedResponse({ cause: getUnexpectedCause(error), message: EXPORT_FAILED_MESSAGE, status: HTTP_SERVER_ERROR });
}

export async function GET(_request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const csvExport = EXPORTS[platform];
  if (!csvExport) return getTextResponse("Not found", HTTP_NOT_FOUND);
  return runInActionContext(EXPORT_ACTION, async () => {
    try {
      return await getExportResponse(csvExport);
    } catch (error) {
      unstable_rethrow(error);
      return getFailureResponse(error);
    }
  });
}

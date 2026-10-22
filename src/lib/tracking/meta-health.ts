import "server-only";

import type { ProblemSeverity } from "@/lib/observability/problem-types";
import { getErrorName } from "@/lib/observability/report-visitor-problem";
import { reportProblem } from "@/lib/observability/report-problem";
import { createServiceClient, isServiceAccessConfigured } from "@/lib/supabase/service-client";
import { MetaConversionsError } from "@/lib/tracking/meta-conversions";

// Whether leads reach Meta (docs/cwr-ads-analytics-fixes-plan.md, D7). Every failure is a
// problem; only a refusal (an HTTP 4xx: bad token, wrong Pixel ID, missing permission) marks the
// meta_conversions check failing, because only the owner can fix those. A timeout or a Meta
// outage would otherwise keep a warning up until the next lead, which may be weeks away.

const CHECK_NAME = "meta_conversions";
const HTTP_CLIENT_ERROR_MIN = 400;
const HTTP_SERVER_ERROR_MIN = 500;

/** Our own words plus Meta's numeric code only: Meta's message could repeat what was sent. */
type MetaSendFailure = { severity: ProblemSeverity; code: string; detail: string; isRefusal: boolean };

function isRefusalStatus(status: number): boolean {
  return status >= HTTP_CLIENT_ERROR_MIN && status < HTTP_SERVER_ERROR_MIN;
}

function getAnswerFailure({ status, metaErrorCode }: { status: number; metaErrorCode: number | null }): MetaSendFailure {
  const errorCodeText = metaErrorCode === null ? "" : `, error code ${metaErrorCode}`;
  const isRefusal = isRefusalStatus(status);
  return { severity: isRefusal ? "error" : "warning", code: `http_${status}`, detail: `Meta answered ${status}${errorCodeText}`, isRefusal };
}

function getMetaSendFailure(error: unknown): MetaSendFailure {
  if (error instanceof MetaConversionsError && error.context.status !== null) {
    return getAnswerFailure({ status: error.context.status, metaErrorCode: error.context.metaErrorCode });
  }
  if (getErrorName(error) === "TimeoutError") return { severity: "warning", code: "timeout", detail: "Meta didn't answer in time", isRefusal: false };
  return { severity: "warning", code: "network", detail: "Meta couldn't be reached", isRefusal: false };
}

async function touchMetaCheck({ isOk, error }: { isOk: boolean; error: string | null }): Promise<void> {
  if (!isServiceAccessConfigured()) return;
  try {
    const { error: writeError } = await createServiceClient().rpc("touch_health_check", { p_name: CHECK_NAME, p_is_ok: isOk, p_error: error });
    if (writeError) console.error(JSON.stringify({ message: "Meta health check not saved", code: writeError.code }));
  } catch (writeError) {
    // Safe to continue: the lead is already saved, and a failure is already in the problem log.
    console.error(JSON.stringify({ message: "Meta health check not saved", error: getErrorName(writeError) }));
  }
}

export async function recordMetaSendSuccess(): Promise<void> {
  await touchMetaCheck({ isOk: true, error: null });
}

export async function recordMetaSendFailure(error: unknown): Promise<void> {
  const { severity, code, detail, isRefusal } = getMetaSendFailure(error);
  await reportProblem({ action: "tracking.meta_send", origin: "job", stage: "external", severity, code, detail });
  if (isRefusal) await touchMetaCheck({ isOk: false, error: detail });
}

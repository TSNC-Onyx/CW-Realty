import "server-only";

import { reportVisitorProblem, type VisitorProblem } from "@/lib/observability/report-visitor-problem";
import { getCloudflareBinding } from "@/lib/platform/cloudflare-bindings";

// Per-visitor limits on public endpoints (Infra §2 "rate limit all public endpoints"),
// using the Workers Rate Limiting bindings in wrangler.jsonc. Without a binding (local,
// CI) nothing is limited.

const FORM_RATE_LIMITER = "FORM_RATE_LIMITER";
const CHAT_RATE_LIMITER = "CHAT_RATE_LIMITER";
const PROBLEM_REPORT_RATE_LIMITER = "PROBLEM_REPORT_RATE_LIMITER";

type RateLimiter = { limit: (options: { key: string }) => Promise<{ success: boolean }> };

/** problemAction: where an outage is recorded; the problem-report endpoint never records its own. */
type LimitCheck = { bindingName: string; keyPrefix: string; visitorKey: string | null; problemAction?: VisitorProblem["action"] };

// One record per running copy and limiter is enough to show an outage.
const reportedOutages = new Set<string>();

async function reportLimiterOutage({ bindingName, problemAction, error }: { bindingName: string; problemAction: VisitorProblem["action"]; error: unknown }): Promise<void> {
  if (reportedOutages.has(bindingName)) return;
  reportedOutages.add(bindingName);
  const detail = `${bindingName} failed (${error instanceof Error ? error.name : "unknown"}); visitors are not rate limited until it recovers.`;
  await reportVisitorProblem({ action: problemAction, stage: "external", severity: "warning", code: "rate_limiter_down", detail });
}

/** Fails open if the limiter itself errors: the Turnstile check still protects the endpoint. */
async function isOverLimit({ bindingName, keyPrefix, visitorKey, problemAction }: LimitCheck): Promise<boolean> {
  const limiter = getCloudflareBinding<RateLimiter>(bindingName);
  if (!limiter || !visitorKey) return false;
  try {
    const { success } = await limiter.limit({ key: `${keyPrefix}:${visitorKey}` });
    return !success;
  } catch (error) {
    if (problemAction) await reportLimiterOutage({ bindingName, problemAction, error });
    return false;
  }
}

export async function isOverFormLimit(visitorKey: string | null, problemAction: VisitorProblem["action"]): Promise<boolean> {
  return isOverLimit({ bindingName: FORM_RATE_LIMITER, keyPrefix: "form", visitorKey, problemAction });
}

export async function isOverChatLimit(visitorKey: string | null): Promise<boolean> {
  return isOverLimit({ bindingName: CHAT_RATE_LIMITER, keyPrefix: "chat", visitorKey, problemAction: "site.chat_message" });
}

export async function isOverProblemReportLimit(visitorKey: string | null): Promise<boolean> {
  return isOverLimit({ bindingName: PROBLEM_REPORT_RATE_LIMITER, keyPrefix: "problem", visitorKey });
}

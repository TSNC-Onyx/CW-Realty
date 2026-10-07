import "server-only";

import type { ProblemSeverity } from "@/lib/observability/problem-types";
import { reportVisitorProblem } from "@/lib/observability/report-visitor-problem";
import { checkTurnstileToken, type TurnstileCheck, type TurnstileReason } from "@/lib/security/turnstile";

// The Quick Check for website visitors' forms and chat, with every refusal recorded and the
// reason it gives (docs/cwr-reliability-round-plan.md §2.2). Ordinary bot refusals are info;
// a setup problem that blocks every visitor is critical.

const SEVERITY_BY_REASON: Record<Exclude<TurnstileReason, "passed">, ProblemSeverity> = {
  no_token: "info",
  rejected: "info",
  expired: "info",
  unreachable: "warning",
  // A bot can reuse a token solved on another form, so this must not raise a false alarm (E1b).
  wrong_site: "warning",
  not_configured: "critical",
  test_key_in_production: "critical",
};

// Decided from this deployment's own settings, so one record per running copy is enough.
const SETUP_REASONS = new Set<TurnstileReason>(["not_configured", "test_key_in_production"]);
const reportedSetupReasons = new Set<TurnstileReason>();

function isAlreadyReported(reason: TurnstileReason): boolean {
  return SETUP_REASONS.has(reason) && reportedSetupReasons.has(reason);
}

async function reportRefusal({ reason, errorCodes, form }: { reason: Exclude<TurnstileReason, "passed">; errorCodes: string[]; form: string }): Promise<void> {
  if (isAlreadyReported(reason)) return;
  if (SETUP_REASONS.has(reason)) reportedSetupReasons.add(reason);
  const stage = SETUP_REASONS.has(reason) ? "setup" : "external";
  await reportVisitorProblem({ action: "site.bot_check", stage, severity: SEVERITY_BY_REASON[reason], code: reason, detail: errorCodes.length > 0 ? `${form}: ${errorCodes.join(", ")}` : form });
}

/** True when the visitor passed; a refusal is recorded first. */
export async function passesVisitorBotCheck(check: TurnstileCheck): Promise<boolean> {
  const result = await checkTurnstileToken(check);
  if (result.reason !== "passed") await reportRefusal({ reason: result.reason, errorCodes: result.errorCodes, form: check.expectedAction });
  return result.isPassed;
}

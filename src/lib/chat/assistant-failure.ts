import Anthropic from "@anthropic-ai/sdk";

import type { ProblemSeverity } from "@/lib/observability/problem-types";

// How serious a failed assistant reply is (docs/cwr-reliability-round-plan.md §4.2, from
// https://platform.claude.com/docs/en/api/errors). Problems that keep every chat from being
// answered until someone acts (a bad key, billing, a spend limit, a retired model) are
// critical; busy or briefly unavailable is a warning. Visitors always get the hand-off.

export type AssistantFailure = { severity: ProblemSeverity; code: string; detail: string };

const RATE_LIMIT_STATUS = 429;
const CLIENT_ERROR_STATUS = 400;
const SERVER_ERROR_STATUS = 500;
const RETRY_AFTER_HEADER = "retry-after";

function getRequestText(error: InstanceType<typeof Anthropic.APIError>): string {
  return error.requestID ? ` (request ${error.requestID})` : "";
}

// A 429 without retry-after is a spend cap that "keeps failing until access resumes".
function getRateLimitFailure(error: InstanceType<typeof Anthropic.APIError>): AssistantFailure {
  const isSpendCap = !error.headers?.get(RETRY_AFTER_HEADER);
  const severity: ProblemSeverity = isSpendCap ? "critical" : "warning";
  return { severity, code: isSpendCap ? "http_429_spend_cap" : "http_429", detail: `Claude API rate limit${getRequestText(error)}` };
}

function getStatusFailure(error: InstanceType<typeof Anthropic.APIError>): AssistantFailure {
  const status = error.status ?? 0;
  if (status === RATE_LIMIT_STATUS) return getRateLimitFailure(error);
  const isOurFault = status >= CLIENT_ERROR_STATUS && status < SERVER_ERROR_STATUS;
  const severity: ProblemSeverity = isOurFault ? "critical" : "warning";
  return { severity, code: `http_${status}`, detail: `Claude API ${error.type ?? "error"}${getRequestText(error)}` };
}

export function getAssistantFailure(error: unknown): AssistantFailure {
  if (error instanceof Anthropic.APIConnectionTimeoutError) return { severity: "warning", code: "timeout", detail: "Claude API did not answer in time" };
  if (error instanceof Anthropic.APIConnectionError) return { severity: "warning", code: "network", detail: "Could not reach the Claude API" };
  if (error instanceof Anthropic.APIError) return getStatusFailure(error);
  return { severity: "error", code: error instanceof Error ? error.name : "unknown", detail: "The assistant reply failed unexpectedly" };
}

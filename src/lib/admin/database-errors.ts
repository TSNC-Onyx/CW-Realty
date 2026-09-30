import { noteProblemCause, type ProblemCause } from "@/lib/observability/action-context";
import { getScrubbedText } from "@/lib/observability/scrub";

// Turns database errors into plain messages for editors (Admin §1: errors say what to fix).
// Messages raised by our own database rules are already written for people and pass through.
// Every error is also noted as the cause of the current admin action, so the action wrapper
// records it (docs/cwr-error-tracking-plan.md).

type DatabaseError = { code?: string; message: string };

const MESSAGES_BY_CODE: Record<string, string> = {
  "23505": "That is already in use. Choose something different.",
  "42501": "Your role can't make this change.",
  PGRST116: "That item no longer exists. It may have been deleted.",
};

const OWN_RULE_CODES = new Set(["23514", "22023", "P0001", "P0002", "42501"]);
// Wording that only Postgres itself produces; our own rule messages never contain it.
const RAW_DATABASE_WORDING = /violates|permission denied|relation "|column "|constraint "|syntax/i;
const GENERIC_MESSAGE = "Something went wrong while saving. Try again, and contact the site owner if it keeps happening.";
const MAX_DETAIL = 500;

// Classification only; the message people see is decided by getDatabaseErrorMessage.
const CAUSES_BY_CODE: Record<string, Pick<ProblemCause, "stage" | "severity">> = {
  "42501": { stage: "access", severity: "warning" },
  "23505": { stage: "duplicate", severity: "info" },
  PGRST116: { stage: "not_found", severity: "info" },
  "23514": { stage: "rule", severity: "info" },
  "22023": { stage: "rule", severity: "info" },
  P0001: { stage: "rule", severity: "info" },
  P0002: { stage: "rule", severity: "info" },
};

export function getDatabaseProblemCause(error: DatabaseError): ProblemCause {
  const isRawRuleWording = RAW_DATABASE_WORDING.test(error.message) && error.code !== "42501" && error.code !== "23505";
  const known = error.code && !isRawRuleWording ? CAUSES_BY_CODE[error.code] : undefined;
  return {
    ...(known ?? { stage: "database", severity: "error" }),
    code: error.code ?? null,
    detail: getScrubbedText(error.message, MAX_DETAIL),
  };
}

export function getDatabaseErrorMessage(error: DatabaseError): string {
  noteProblemCause(getDatabaseProblemCause(error));
  const isOwnRuleMessage = error.code !== undefined && OWN_RULE_CODES.has(error.code) && !RAW_DATABASE_WORDING.test(error.message);
  if (isOwnRuleMessage) return error.message;
  return (error.code && MESSAGES_BY_CODE[error.code]) || GENERIC_MESSAGE;
}

export function isUniqueViolation(error: DatabaseError): boolean {
  return error.code === "23505";
}

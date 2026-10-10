import type { AuthError } from "@supabase/supabase-js";

import type { FieldErrors } from "@/lib/admin/action-state";
import { getAuthErrorCode, isAuthOutage } from "@/lib/observability/auth-outage";
import { isReferenceWorthy, type ProblemRecordResult, type ProblemSeverity } from "@/lib/observability/problem-types";
import { getReferenceSuffix } from "@/lib/observability/reference";
import { BOT_CHECK_MESSAGES } from "@/lib/security/bot-check-messages";

// How each sign-in step answers an Auth error, and how serious it is
// (docs/cwr-error-tracking-plan.md, Auth). Mistakes the person can fix keep their wording;
// anything wrong on our side says so and gets a reference code.

const TOO_MANY_ATTEMPTS_STATUS = 429;
const CLIENT_ERROR_STATUS = 400;
const SERVER_ERROR_STATUS = 500;
const RATE_LIMIT_CODE = "over_request_rate_limit";
const CAPTCHA_FAILED_CODE = "captcha_failed";
// Supabase passes Cloudflare's reason along: "captcha protection: request disallowed (timeout-or-duplicate)".
const CAPTCHA_EXPIRED_CODE = "captcha_expired";
const CAPTCHA_EXPIRED_REASON = "timeout-or-duplicate";
const INVALID_CREDENTIALS_CODE = "invalid_credentials";
const SAME_PASSWORD_CODE = "same_password";
const WEAK_PASSWORD_CODE = "weak_password";
const LINK_EXPIRED_CODE = "otp_expired";
// Supabase refuses a password change at password-only level for an account that still has an
// authenticator set up; those are removed at release (docs/cwr-password-only-sign-in-plan.md).
const INSUFFICIENT_AAL_CODE = "insufficient_aal";

export const SIGN_IN_UNAVAILABLE_MESSAGE = "Sign-in isn't working right now. Try again in a few minutes.";
export const PASSWORD_NOT_SAVED_MESSAGE = "We couldn't save your new password right now. Try again in a few minutes.";
export const RESET_LINK_SENT_MESSAGE = "If that email belongs to an admin account, a reset link is on its way. It works for one hour.";

/** What gets recorded about an Auth error. */
export type AuthProblemOutcome = { severity: ProblemSeverity; code: string; shownMessage?: string };

/** What gets recorded and what the person is shown. */
export type AuthOutcome = AuthProblemOutcome & { shownMessage: string; fieldErrors?: FieldErrors };

const TOO_MANY_ATTEMPTS_OUTCOME: AuthOutcome = { severity: "info", code: RATE_LIMIT_CODE, shownMessage: "Too many attempts. Wait a few minutes, then try again." };
const CAPTCHA_FAILED_OUTCOME: AuthOutcome = { severity: "info", code: CAPTCHA_FAILED_CODE, shownMessage: BOT_CHECK_MESSAGES.refused };
const CAPTCHA_EXPIRED_OUTCOME: AuthOutcome = { ...CAPTCHA_FAILED_OUTCOME, code: CAPTCHA_EXPIRED_CODE };
const WRONG_PASSWORD_OUTCOME: AuthOutcome = {
  severity: "info",
  code: INVALID_CREDENTIALS_CODE,
  shownMessage: "That email and password don't match an account. Check them and try again.",
};
const SAME_PASSWORD_OUTCOME: AuthOutcome = {
  severity: "info",
  code: SAME_PASSWORD_CODE,
  shownMessage: "Choose a password you haven't used here before.",
  fieldErrors: { password: "Use a new password" },
};
const WEAK_PASSWORD_OUTCOME: AuthOutcome = {
  severity: "info",
  code: WEAK_PASSWORD_CODE,
  shownMessage: "We couldn't save that password. Choose a longer, less common one.",
  fieldErrors: { password: "Choose a stronger password" },
};
const OLD_SIGN_IN_CODE_OUTCOME: AuthOutcome = {
  severity: "warning",
  code: INSUFFICIENT_AAL_CODE,
  shownMessage: "This account still has an old sign-in code from the authenticator app. Ask the site owner to remove it, then try again.",
};

/** A refused Quick Check: expired tokens are told apart from other refusals in the log. */
function getCaptchaOutcome(error: AuthError): AuthOutcome {
  return error.message.includes(CAPTCHA_EXPIRED_REASON) ? CAPTCHA_EXPIRED_OUTCOME : CAPTCHA_FAILED_OUTCOME;
}

/** True when the outcome is a refused Quick Check. */
export function isBotCheckOutcome(outcome: AuthProblemOutcome): boolean {
  return outcome.code === CAPTCHA_FAILED_CODE || outcome.code === CAPTCHA_EXPIRED_CODE;
}

function isClientErrorStatus(status: number | undefined): boolean {
  return status !== undefined && status >= CLIENT_ERROR_STATUS && status < SERVER_ERROR_STATUS;
}

/** A step that broke on our side, or threw: critical, with the given message. */
export function getFailedStepOutcome({ error, shownMessage }: { error: unknown; shownMessage: string }): AuthOutcome {
  return { severity: "critical", code: getAuthErrorCode(error), shownMessage };
}

function getSignInUnavailableOutcome(error: unknown): AuthOutcome {
  return getFailedStepOutcome({ error, shownMessage: SIGN_IN_UNAVAILABLE_MESSAGE });
}

/** Password step. Only a wrong password, the bot check, or too many tries is the person's to fix. */
export function getSignInOutcome(error: AuthError): AuthOutcome {
  if (error.code === INVALID_CREDENTIALS_CODE) return WRONG_PASSWORD_OUTCOME;
  if (error.status === TOO_MANY_ATTEMPTS_STATUS) return TOO_MANY_ATTEMPTS_OUTCOME;
  if (error.code === CAPTCHA_FAILED_CODE) return getCaptchaOutcome(error);
  return getSignInUnavailableOutcome(error);
}

/**
 * The reset screen shows the same message whether or not the account exists. A refused Quick
 * Check is the exception: it says nothing about the account, and hiding it leaves the person
 * waiting for an email that never comes.
 */
export function getPasswordResetOutcome(error: AuthError): AuthOutcome {
  if (error.status === TOO_MANY_ATTEMPTS_STATUS) return { severity: "info", code: RATE_LIMIT_CODE, shownMessage: RESET_LINK_SENT_MESSAGE };
  if (error.code === CAPTCHA_FAILED_CODE) return getCaptchaOutcome(error);
  return { severity: "error", code: getAuthErrorCode(error), shownMessage: RESET_LINK_SENT_MESSAGE };
}

export function getSetPasswordOutcome(error: AuthError): AuthOutcome {
  if (error.code === SAME_PASSWORD_CODE) return SAME_PASSWORD_OUTCOME;
  if (error.code === INSUFFICIENT_AAL_CODE) return OLD_SIGN_IN_CODE_OUTCOME;
  if (error.code === WEAK_PASSWORD_CODE) return WEAK_PASSWORD_OUTCOME;
  const severity: ProblemSeverity = isAuthOutage(error) ? "critical" : "error";
  return { severity, code: getAuthErrorCode(error), shownMessage: PASSWORD_NOT_SAVED_MESSAGE };
}

/** Invite and reset links. An expired or used link is ordinary; the page explains it. */
export function getEmailLinkOutcome(error: AuthError): AuthProblemOutcome {
  const code = getAuthErrorCode(error);
  if (isAuthOutage(error)) return { severity: "error", code };
  const isRejectedLink = code === LINK_EXPIRED_CODE || isClientErrorStatus(error.status);
  return { severity: isRejectedLink ? "info" : "error", code };
}

/** The message to show, with the reference code for anything worse than a mistake. */
export function getOutcomeMessage({ outcome, record }: { outcome: AuthOutcome; record: ProblemRecordResult }): string {
  if (!isReferenceWorthy(outcome.severity)) return outcome.shownMessage;
  return `${outcome.shownMessage}${getReferenceSuffix({ reference: record.reference, isStored: record.stored === true })}`;
}

"use server";

import type { AuthError } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { getErrorState, getFormValues, getSuccessState, type ActionState } from "@/lib/admin/action-state";
import {
  getFailedStepOutcome,
  getPasswordResetOutcome,
  getSetPasswordOutcome,
  getSignInOutcome,
  isBotCheckOutcome,
  PASSWORD_NOT_SAVED_MESSAGE,
  RESET_LINK_SENT_MESSAGE,
  SIGN_IN_UNAVAILABLE_MESSAGE,
  type AuthOutcome,
} from "@/lib/admin/auth-outcomes";
import { reportAuthFailure, reportAuthProblem, reportOutdatedSignInPage, runSignInStep } from "@/lib/admin/auth-problems";
import { emailSchema, getFieldErrorsFromZod, newPasswordSchema, signInSchema } from "@/lib/admin/auth-schemas";
import { ADMIN_LOGIN_PATH, getSafeAdminPath } from "@/lib/admin/paths";
import { isAuthOutage } from "@/lib/observability/auth-outage";
import type { ProblemAction } from "@/lib/observability/problem-catalog";
import { BOT_CHECK_KEY_FIELD, isOutdatedBotCheckKey } from "@/lib/security/bot-check-key";
import { BOT_CHECK_MESSAGES } from "@/lib/security/bot-check-messages";
import { TURNSTILE_FIELD } from "@/lib/security/turnstile-field-name";
import { createSessionClient, type SessionClient } from "@/lib/supabase/server-client";

// Sign-in steps (Phase 3 plan, task 3): email and password only, no authenticator code (owner
// choice 2026-10-09, docs/cwr-password-only-sign-in-plan.md). Each returns a plain message for
// the form or redirects to the next page. Messages never reveal whether an account exists.
// Every failure is recorded (docs/cwr-error-tracking-plan.md, Auth); nothing typed is.

const SIGN_IN_ACTION: ProblemAction = "auth.sign_in";
const REQUEST_RESET_ACTION: ProblemAction = "auth.request_password_reset";
const SET_PASSWORD_ACTION: ProblemAction = "auth.set_password";

type FailedStep = { action: ProblemAction; error: unknown; outcome: AuthOutcome; values?: Record<string, string> };

function getCaptchaToken(formData: FormData): string | undefined {
  return String(formData.get(TURNSTILE_FIELD) ?? "") || undefined;
}

// Only the email comes back: the page reloads itself and fills it in again.
async function getOutdatedPageState({ action, email }: { action: ProblemAction; email: string }): Promise<ActionState> {
  await reportOutdatedSignInPage(action);
  return { ...getErrorState({ message: BOT_CHECK_MESSAGES.outdatedAutoRefresh, values: { email } }), recovery: "refresh" };
}

async function reportFailedStep({ action, error, outcome, values }: FailedStep): Promise<ActionState> {
  const message = await reportAuthFailure({ action, error, outcome });
  return getErrorState({ message, fieldErrors: outcome.fieldErrors, values });
}

async function signIn(formData: FormData): Promise<ActionState> {
  const values = getFormValues(formData);
  const parsed = signInSchema.safeParse(values);
  if (!parsed.success) return getErrorState({ message: "Fix the fields below.", fieldErrors: getFieldErrorsFromZod(parsed.error), values });
  if (isOutdatedBotCheckKey(formData.get(BOT_CHECK_KEY_FIELD))) return getOutdatedPageState({ action: SIGN_IN_ACTION, email: parsed.data.email });
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithPassword({ ...parsed.data, options: { captchaToken: getCaptchaToken(formData) } });
  if (error) return reportFailedStep({ action: SIGN_IN_ACTION, error, outcome: getSignInOutcome(error), values });
  redirect(getSafeAdminPath(values.next));
}

export async function signInAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const getFailedState = (message: string) => getErrorState({ message, values: getFormValues(formData) });
  return runSignInStep({ action: SIGN_IN_ACTION, failureMessage: SIGN_IN_UNAVAILABLE_MESSAGE, getFailedState }, () => signIn(formData));
}

async function requestReset(formData: FormData): Promise<ActionState> {
  const values = getFormValues(formData);
  const parsedEmail = emailSchema.safeParse(values.email ?? "");
  if (!parsedEmail.success) return getErrorState({ message: "Check the email address.", fieldErrors: { email: parsedEmail.error.issues[0]?.message ?? "" }, values });
  // The email link is built from the Auth "Site URL" setting (supabase/templates/recovery.html),
  // never from request headers, so a forged Host header cannot redirect the link.
  if (isOutdatedBotCheckKey(formData.get(BOT_CHECK_KEY_FIELD))) return getOutdatedPageState({ action: REQUEST_RESET_ACTION, email: parsedEmail.data });
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsedEmail.data, { captchaToken: getCaptchaToken(formData) });
  if (!error) return getSuccessState(RESET_LINK_SENT_MESSAGE);
  // Recorded, but apart from a refused Quick Check the screen stays the same, so it never
  // reveals whether an account exists.
  const outcome = getPasswordResetOutcome(error);
  await reportAuthProblem({ action: REQUEST_RESET_ACTION, error, outcome });
  return isBotCheckOutcome(outcome) ? getErrorState({ message: outcome.shownMessage, values: { email: parsedEmail.data } }) : getSuccessState(RESET_LINK_SENT_MESSAGE);
}

export async function requestPasswordResetAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const getFailedState = (message: string) => getErrorState({ message, values: getFormValues(formData) });
  return runSignInStep({ action: REQUEST_RESET_ACTION, failureMessage: SIGN_IN_UNAVAILABLE_MESSAGE, getFailedState }, () => requestReset(formData));
}

async function reportPasswordStepFailure(error: AuthError): Promise<ActionState> {
  return reportFailedStep({ action: SET_PASSWORD_ACTION, error, outcome: getFailedStepOutcome({ error, shownMessage: PASSWORD_NOT_SAVED_MESSAGE }) });
}

/** Redirects when the person isn't signed in; returns a failure state when the check itself failed. */
async function fetchPasswordChangeBlock(supabase: SessionClient): Promise<ActionState | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error && isAuthOutage(error)) return reportPasswordStepFailure(error);
  if (!data?.claims) redirect(ADMIN_LOGIN_PATH);
  return null;
}

async function setPassword(formData: FormData): Promise<ActionState> {
  const values = getFormValues(formData);
  const parsed = newPasswordSchema.safeParse(values);
  if (!parsed.success) return getErrorState({ message: "Fix the fields below.", fieldErrors: getFieldErrorsFromZod(parsed.error) });
  const supabase = await createSessionClient();
  const blockedState = await fetchPasswordChangeBlock(supabase);
  if (blockedState) return blockedState;
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return reportFailedStep({ action: SET_PASSWORD_ACTION, error, outcome: getSetPasswordOutcome(error) });
  redirect(getSafeAdminPath(values.next));
}

export async function setPasswordAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const getFailedState = (message: string) => getErrorState({ message });
  return runSignInStep({ action: SET_PASSWORD_ACTION, failureMessage: PASSWORD_NOT_SAVED_MESSAGE, getFailedState }, () => setPassword(formData));
}

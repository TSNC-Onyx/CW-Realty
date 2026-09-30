"use server";

import type { AuthError } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { getErrorState, getFormValues, getSuccessState, type ActionState } from "@/lib/admin/action-state";
import {
  getCodeCheckOutcome,
  getFailedStepOutcome,
  getPasswordResetOutcome,
  getSetPasswordOutcome,
  getSetupStartOutcome,
  getSignInOutcome,
  getSignInUnavailableOutcome,
  PASSWORD_NOT_SAVED_MESSAGE,
  RESET_LINK_SENT_MESSAGE,
  SIGN_IN_UNAVAILABLE_MESSAGE,
  type AuthOutcome,
} from "@/lib/admin/auth-outcomes";
import { reportAuthFailure, reportAuthProblem, runSignInStep } from "@/lib/admin/auth-problems";
import { emailSchema, getFieldErrorsFromZod, mfaCodeSchema, newPasswordSchema, signInSchema } from "@/lib/admin/auth-schemas";
import {
  ADMIN_LOGIN_PATH,
  ADMIN_MFA_PATH,
  ADMIN_MFA_SETUP_PATH,
  ADMIN_SET_PASSWORD_PATH,
  getSafeAdminPath,
} from "@/lib/admin/paths";
import { getAuthErrorCode, isAuthOutage } from "@/lib/observability/auth-outage";
import type { ProblemAction } from "@/lib/observability/problem-catalog";
import { TURNSTILE_FIELD } from "@/lib/security/turnstile-field-name";
import { createSessionClient, type SessionClient } from "@/lib/supabase/server-client";

// Sign-in steps (Phase 3 plan, task 3). Each returns a plain message for the form or
// redirects to the next step. Messages never reveal whether an account exists. Every
// failure is recorded (docs/cwr-error-tracking-plan.md, Auth); nothing typed is.

const SIGN_IN_ACTION: ProblemAction = "auth.sign_in";
const VERIFY_CODE_ACTION: ProblemAction = "auth.verify_code";
const START_SETUP_ACTION: ProblemAction = "auth.start_code_setup";
const CONFIRM_SETUP_ACTION: ProblemAction = "auth.confirm_code_setup";
const REQUEST_RESET_ACTION: ProblemAction = "auth.request_password_reset";
const SET_PASSWORD_ACTION: ProblemAction = "auth.set_password";

const INSUFFICIENT_AAL_CODE = "insufficient_aal";
const CODE_BEFORE_PASSWORD_PATH = `${ADMIN_MFA_PATH}?next=${encodeURIComponent(ADMIN_SET_PASSWORD_PATH)}`;
const WRONG_SIGN_IN_CODE_MESSAGE = "That code didn't work. Codes change every 30 seconds — try the newest one.";
const WRONG_SETUP_CODE_MESSAGE = "That code didn't work. Try the newest code in your app.";

export type MfaSetupState = ActionState & { factorId: string; qrCode: string; secret: string };

/** error: the sign-in service couldn't list the account's authenticators. */
type FactorCheck = { factorId: string | null; error: AuthError | null };

type FailedStep = { action: ProblemAction; error: unknown; outcome: AuthOutcome; values?: Record<string, string> };

function getCaptchaToken(formData: FormData): string | undefined {
  return String(formData.get(TURNSTILE_FIELD) ?? "") || undefined;
}

function getMfaNextStep({ hasVerifiedFactor, next }: { hasVerifiedFactor: boolean; next: string }): string {
  const step = hasVerifiedFactor ? ADMIN_MFA_PATH : ADMIN_MFA_SETUP_PATH;
  return `${step}?next=${encodeURIComponent(next)}`;
}

function getSetupFailedState(state: MfaSetupState): (message: string) => MfaSetupState {
  return (message) => ({ ...state, ...getErrorState({ message }) });
}

async function reportFailedStep({ action, error, outcome, values }: FailedStep): Promise<ActionState> {
  const message = await reportAuthFailure({ action, error, outcome });
  return getErrorState({ message, fieldErrors: outcome.fieldErrors, values });
}

async function fetchVerifiedFactor(supabase: SessionClient): Promise<FactorCheck> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return { factorId: null, error };
  return { factorId: data.totp.find((factor) => factor.status === "verified")?.id ?? null, error: null };
}

async function signIn(formData: FormData): Promise<ActionState> {
  const values = getFormValues(formData);
  const parsed = signInSchema.safeParse(values);
  if (!parsed.success) return getErrorState({ message: "Fix the fields below.", fieldErrors: getFieldErrorsFromZod(parsed.error), values });
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithPassword({ ...parsed.data, options: { captchaToken: getCaptchaToken(formData) } });
  if (error) return reportFailedStep({ action: SIGN_IN_ACTION, error, outcome: getSignInOutcome(error), values });
  // A failed authenticator lookup must not send someone to set up a second one.
  const factor = await fetchVerifiedFactor(supabase);
  if (factor.error) return reportFailedStep({ action: SIGN_IN_ACTION, error: factor.error, outcome: getSignInUnavailableOutcome(factor.error), values });
  redirect(getMfaNextStep({ hasVerifiedFactor: factor.factorId !== null, next: getSafeAdminPath(values.next) }));
}

export async function signInAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const getFailedState = (message: string) => getErrorState({ message, values: getFormValues(formData) });
  return runSignInStep({ action: SIGN_IN_ACTION, failureMessage: SIGN_IN_UNAVAILABLE_MESSAGE, getFailedState }, () => signIn(formData));
}

async function verifyCode(formData: FormData): Promise<ActionState> {
  const values = getFormValues(formData);
  const parsedCode = mfaCodeSchema.safeParse(values.code ?? "");
  if (!parsedCode.success) return getErrorState({ message: "Check the code.", fieldErrors: { code: parsedCode.error.issues[0]?.message ?? "" } });
  const supabase = await createSessionClient();
  const factor = await fetchVerifiedFactor(supabase);
  if (factor.error) return reportFailedStep({ action: VERIFY_CODE_ACTION, error: factor.error, outcome: getSignInUnavailableOutcome(factor.error) });
  if (!factor.factorId) redirect(ADMIN_MFA_SETUP_PATH);
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.factorId, code: parsedCode.data });
  if (error) return reportFailedStep({ action: VERIFY_CODE_ACTION, error, outcome: getCodeCheckOutcome({ error, rejectedMessage: WRONG_SIGN_IN_CODE_MESSAGE }) });
  redirect(getSafeAdminPath(values.next));
}

export async function verifyMfaAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const getFailedState = (message: string) => getErrorState({ message });
  return runSignInStep({ action: VERIFY_CODE_ACTION, failureMessage: SIGN_IN_UNAVAILABLE_MESSAGE, getFailedState }, () => verifyCode(formData));
}

// Setup still goes ahead when an old, unfinished authenticator can't be removed.
async function reportCleanupProblem(error: AuthError): Promise<void> {
  await reportAuthProblem({ action: START_SETUP_ACTION, error, outcome: { severity: "warning", code: getAuthErrorCode(error) } });
}

async function removeUnfinishedFactors(supabase: SessionClient): Promise<void> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return reportCleanupProblem(error);
  const unfinished = data.all.filter((factor) => factor.status === "unverified");
  const results = await Promise.all(unfinished.map((factor) => supabase.auth.mfa.unenroll({ factorId: factor.id })));
  const firstError = results.find((result) => result.error)?.error;
  if (firstError) await reportCleanupProblem(firstError);
}

async function startSetup(state: MfaSetupState): Promise<MfaSetupState> {
  const supabase = await createSessionClient();
  await removeUnfinishedFactors(supabase);
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
  if (error) return { ...state, ...(await reportFailedStep({ action: START_SETUP_ACTION, error, outcome: getSetupStartOutcome(error) })) };
  return { ...getSuccessState("Scan the code, then enter the 6 digits it shows."), factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function startMfaSetupAction(state: MfaSetupState): Promise<MfaSetupState> {
  const boundary = { action: START_SETUP_ACTION, failureMessage: SIGN_IN_UNAVAILABLE_MESSAGE, getFailedState: getSetupFailedState(state) };
  return runSignInStep(boundary, () => startSetup(state));
}

async function confirmSetup(state: MfaSetupState, formData: FormData): Promise<MfaSetupState> {
  const values = getFormValues(formData);
  const parsedCode = mfaCodeSchema.safeParse(values.code ?? "");
  if (!parsedCode.success) return { ...state, ...getErrorState({ message: "Check the code.", fieldErrors: { code: parsedCode.error.issues[0]?.message ?? "" } }) };
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: state.factorId, code: parsedCode.data });
  if (error) return { ...state, ...(await reportFailedStep({ action: CONFIRM_SETUP_ACTION, error, outcome: getCodeCheckOutcome({ error, rejectedMessage: WRONG_SETUP_CODE_MESSAGE }) })) };
  redirect(getSafeAdminPath(values.next));
}

export async function confirmMfaSetupAction(state: MfaSetupState, formData: FormData): Promise<MfaSetupState> {
  const boundary = { action: CONFIRM_SETUP_ACTION, failureMessage: SIGN_IN_UNAVAILABLE_MESSAGE, getFailedState: getSetupFailedState(state) };
  return runSignInStep(boundary, () => confirmSetup(state, formData));
}

async function requestReset(formData: FormData): Promise<ActionState> {
  const values = getFormValues(formData);
  const parsedEmail = emailSchema.safeParse(values.email ?? "");
  if (!parsedEmail.success) return getErrorState({ message: "Check the email address.", fieldErrors: { email: parsedEmail.error.issues[0]?.message ?? "" }, values });
  // The email link is built from the Auth "Site URL" setting (supabase/templates/recovery.html),
  // never from request headers, so a forged Host header cannot redirect the link.
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsedEmail.data, { captchaToken: getCaptchaToken(formData) });
  // Recorded, but the screen stays the same either way, so it never reveals whether an account exists.
  if (error) await reportAuthProblem({ action: REQUEST_RESET_ACTION, error, outcome: getPasswordResetOutcome(error) });
  return getSuccessState(RESET_LINK_SENT_MESSAGE);
}

export async function requestPasswordResetAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const getFailedState = (message: string) => getErrorState({ message, values: getFormValues(formData) });
  return runSignInStep({ action: REQUEST_RESET_ACTION, failureMessage: SIGN_IN_UNAVAILABLE_MESSAGE, getFailedState }, () => requestReset(formData));
}

async function reportPasswordStepFailure(error: AuthError): Promise<ActionState> {
  return reportFailedStep({ action: SET_PASSWORD_ACTION, error, outcome: getFailedStepOutcome({ error, shownMessage: PASSWORD_NOT_SAVED_MESSAGE }) });
}

/** Redirects when the person must sign in or confirm a code first; returns a failure state when the check itself failed. */
async function fetchPasswordChangeBlock(supabase: SessionClient): Promise<ActionState | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error && isAuthOutage(error)) return reportPasswordStepFailure(error);
  if (!data?.claims) redirect(ADMIN_LOGIN_PATH);
  if (data.claims.aal === "aal2") return null;
  // A reset link alone must not change the password of someone who uses sign-in codes.
  const factor = await fetchVerifiedFactor(supabase);
  if (factor.error) return reportPasswordStepFailure(factor.error);
  if (factor.factorId) redirect(CODE_BEFORE_PASSWORD_PATH);
  return null;
}

async function sendToCodeStep(error: AuthError): Promise<never> {
  await reportAuthProblem({ action: SET_PASSWORD_ACTION, error, outcome: { severity: "info", code: INSUFFICIENT_AAL_CODE } });
  redirect(CODE_BEFORE_PASSWORD_PATH);
}

async function setPassword(formData: FormData): Promise<ActionState> {
  const values = getFormValues(formData);
  const parsed = newPasswordSchema.safeParse(values);
  if (!parsed.success) return getErrorState({ message: "Fix the fields below.", fieldErrors: getFieldErrorsFromZod(parsed.error) });
  const supabase = await createSessionClient();
  const blockedState = await fetchPasswordChangeBlock(supabase);
  if (blockedState) return blockedState;
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error?.code === INSUFFICIENT_AAL_CODE) return sendToCodeStep(error);
  if (error) return reportFailedStep({ action: SET_PASSWORD_ACTION, error, outcome: getSetPasswordOutcome(error) });
  redirect(getSafeAdminPath(values.next));
}

export async function setPasswordAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const getFailedState = (message: string) => getErrorState({ message });
  return runSignInStep({ action: SET_PASSWORD_ACTION, failureMessage: PASSWORD_NOT_SAVED_MESSAGE, getFailedState }, () => setPassword(formData));
}

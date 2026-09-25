"use server";

import { redirect } from "next/navigation";

import { getErrorState, getFormValues, getSuccessState, type ActionState } from "@/lib/admin/action-state";
import { emailSchema, getFieldErrorsFromZod, mfaCodeSchema, newPasswordSchema, signInSchema } from "@/lib/admin/auth-schemas";
import {
  ADMIN_LOGIN_PATH,
  ADMIN_MFA_PATH,
  ADMIN_MFA_SETUP_PATH,
  ADMIN_SET_PASSWORD_PATH,
  getSafeAdminPath,
} from "@/lib/admin/paths";
import { TURNSTILE_FIELD } from "@/lib/security/turnstile-field-name";
import { createSessionClient, type SessionClient } from "@/lib/supabase/server-client";

// Sign-in steps (Phase 3 plan, task 3). Each returns a plain message for the form or
// redirects to the next step. Messages never reveal whether an account exists.

const TOO_MANY_ATTEMPTS = 429;

export type MfaSetupState = ActionState & { factorId: string; qrCode: string; secret: string };

async function getMfaNextStep(supabase: SessionClient, next: string): Promise<string> {
  const { data } = await supabase.auth.mfa.listFactors();
  const hasVerifiedFactor = (data?.totp ?? []).some((factor) => factor.status === "verified");
  const step = hasVerifiedFactor ? ADMIN_MFA_PATH : ADMIN_MFA_SETUP_PATH;
  return `${step}?next=${encodeURIComponent(next)}`;
}

export async function signInAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const values = getFormValues(formData);
  const parsed = signInSchema.safeParse(values);
  if (!parsed.success) return getErrorState({ message: "Fix the fields below.", fieldErrors: getFieldErrorsFromZod(parsed.error), values });
  const supabase = await createSessionClient();
  const captchaToken = String(formData.get(TURNSTILE_FIELD) ?? "") || undefined;
  const { error } = await supabase.auth.signInWithPassword({ ...parsed.data, options: { captchaToken } });
  if (error?.status === TOO_MANY_ATTEMPTS) return getErrorState({ message: "Too many attempts. Wait a few minutes, then try again.", values });
  if (error?.code === "captcha_failed") return getErrorState({ message: "Please complete the quick check, then sign in again.", values });
  if (error) return getErrorState({ message: "That email and password don't match an account. Check them and try again.", values });
  redirect(await getMfaNextStep(supabase, getSafeAdminPath(values.next)));
}

async function getVerifiedFactorId(supabase: SessionClient): Promise<string | null> {
  const { data } = await supabase.auth.mfa.listFactors();
  return (data?.totp ?? []).find((factor) => factor.status === "verified")?.id ?? null;
}

export async function verifyMfaAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const values = getFormValues(formData);
  const parsedCode = mfaCodeSchema.safeParse(values.code ?? "");
  if (!parsedCode.success) return getErrorState({ message: "Check the code.", fieldErrors: { code: parsedCode.error.issues[0]?.message ?? "" } });
  const supabase = await createSessionClient();
  const factorId = await getVerifiedFactorId(supabase);
  if (!factorId) redirect(ADMIN_MFA_SETUP_PATH);
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: parsedCode.data });
  if (error) return getErrorState({ message: "That code didn't work. Codes change every 30 seconds — try the newest one.", fieldErrors: { code: "Enter the current 6-digit code" } });
  redirect(getSafeAdminPath(values.next));
}

async function removeUnfinishedFactors(supabase: SessionClient): Promise<void> {
  const { data } = await supabase.auth.mfa.listFactors();
  const unfinished = (data?.all ?? []).filter((factor) => factor.status === "unverified");
  await Promise.all(unfinished.map((factor) => supabase.auth.mfa.unenroll({ factorId: factor.id })));
}

export async function startMfaSetupAction(state: MfaSetupState): Promise<MfaSetupState> {
  const supabase = await createSessionClient();
  await removeUnfinishedFactors(supabase);
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) return { ...state, ...getErrorState({ message: "We couldn't start the setup. Refresh the page and try again." }) };
  return { ...getSuccessState("Scan the code, then enter the 6 digits it shows."), factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function confirmMfaSetupAction(state: MfaSetupState, formData: FormData): Promise<MfaSetupState> {
  const values = getFormValues(formData);
  const parsedCode = mfaCodeSchema.safeParse(values.code ?? "");
  if (!parsedCode.success) return { ...state, ...getErrorState({ message: "Check the code.", fieldErrors: { code: parsedCode.error.issues[0]?.message ?? "" } }) };
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: state.factorId, code: parsedCode.data });
  if (error) return { ...state, ...getErrorState({ message: "That code didn't work. Try the newest code in your app.", fieldErrors: { code: "Enter the current 6-digit code" } }) };
  redirect(getSafeAdminPath(values.next));
}

export async function requestPasswordResetAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const values = getFormValues(formData);
  const parsedEmail = emailSchema.safeParse(values.email ?? "");
  if (!parsedEmail.success) return getErrorState({ message: "Check the email address.", fieldErrors: { email: parsedEmail.error.issues[0]?.message ?? "" }, values });
  // The email link is built from the Auth "Site URL" setting (supabase/templates/recovery.html),
  // never from request headers, so a forged Host header cannot redirect the link.
  const supabase = await createSessionClient();
  await supabase.auth.resetPasswordForEmail(parsedEmail.data, { captchaToken: String(formData.get(TURNSTILE_FIELD) ?? "") || undefined });
  return getSuccessState("If that email belongs to an admin account, a reset link is on its way. It works for one hour.");
}

export async function setPasswordAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const values = getFormValues(formData);
  const parsed = newPasswordSchema.safeParse(values);
  if (!parsed.success) return getErrorState({ message: "Fix the fields below.", fieldErrors: getFieldErrorsFromZod(parsed.error) });
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(ADMIN_LOGIN_PATH);
  // A reset link alone must not change the password of someone who uses sign-in codes.
  if (data.claims.aal !== "aal2" && (await getVerifiedFactorId(supabase))) redirect(`${ADMIN_MFA_PATH}?next=${encodeURIComponent(ADMIN_SET_PASSWORD_PATH)}`);
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error?.code === "insufficient_aal") redirect(`${ADMIN_MFA_PATH}?next=${encodeURIComponent(ADMIN_SET_PASSWORD_PATH)}`);
  if (error?.code === "same_password") return getErrorState({ message: "Choose a password you haven't used here before.", fieldErrors: { password: "Use a new password" } });
  if (error) return getErrorState({ message: "We couldn't save that password. Choose a longer, less common one." , fieldErrors: { password: "Choose a stronger password" } });
  redirect(getSafeAdminPath(values.next));
}

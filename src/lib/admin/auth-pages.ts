import "server-only";

import type { AuthError } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { reportAuthProblem } from "@/lib/admin/auth-problems";
import { ADMIN_HOME_PATH, ADMIN_LOGIN_PATH } from "@/lib/admin/paths";
import { getAuthErrorCode, isAuthOutage } from "@/lib/observability/auth-outage";
import { createSessionClient } from "@/lib/supabase/server-client";

// Checks shared by the sign-in step pages. A sign-in service outage is recorded and
// explained on the sign-in page; it never looks like being signed out
// (docs/cwr-error-tracking-plan.md, Auth).

export const AUTH_UNAVAILABLE_REASON = "auth-unavailable";
const AUTH_UNAVAILABLE_PATH = `${ADMIN_LOGIN_PATH}?reason=${AUTH_UNAVAILABLE_REASON}`;

/** unavailable: the sign-in service didn't answer, so the stage is unknown. */
export type SignInStage = "signed-out" | "password-only" | "verified" | "unavailable";

async function reportSessionCheckFailure(error: AuthError): Promise<void> {
  await reportAuthProblem({ action: "auth.session_check", error, outcome: { severity: "critical", code: getAuthErrorCode(error) } });
}

export async function fetchSignInStage(): Promise<SignInStage> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error && isAuthOutage(error)) {
    await reportSessionCheckFailure(error);
    return "unavailable";
  }
  if (!data?.claims) return "signed-out";
  return data.claims.aal === "aal2" ? "verified" : "password-only";
}

/** When the authenticator lookup fails, sends the person to the sign-in page's outage notice instead of guessing. */
export async function fetchHasVerifiedFactor(): Promise<boolean> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) {
    await reportSessionCheckFailure(error);
    redirect(AUTH_UNAVAILABLE_PATH);
  }
  return data.totp.some((factor) => factor.status === "verified");
}

/** Sends the person to the outage notice when the sign-in service didn't answer. */
export function requireAvailableStage(stage: SignInStage): void {
  if (stage === "unavailable") redirect(AUTH_UNAVAILABLE_PATH);
}

/** Pages after the password step need a session; fully signed-in people go to the dashboard. */
export async function requirePasswordOnlyStage(): Promise<void> {
  const stage = await fetchSignInStage();
  requireAvailableStage(stage);
  if (stage === "signed-out") redirect(ADMIN_LOGIN_PATH);
  if (stage === "verified") redirect(ADMIN_HOME_PATH);
}

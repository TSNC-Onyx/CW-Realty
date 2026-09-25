import "server-only";

import { redirect } from "next/navigation";

import { ADMIN_HOME_PATH, ADMIN_LOGIN_PATH } from "@/lib/admin/paths";
import { createSessionClient } from "@/lib/supabase/server-client";

// Checks shared by the sign-in step pages.

export type SignInStage = "signed-out" | "password-only" | "verified";

export async function fetchSignInStage(): Promise<SignInStage> {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return "signed-out";
  return data.claims.aal === "aal2" ? "verified" : "password-only";
}

export async function fetchHasVerifiedFactor(): Promise<boolean> {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.mfa.listFactors();
  return (data?.totp ?? []).some((factor) => factor.status === "verified");
}

/** Pages after the password step need a session; fully signed-in people go to the dashboard. */
export async function requirePasswordOnlyStage(): Promise<void> {
  const stage = await fetchSignInStage();
  if (stage === "signed-out") redirect(ADMIN_LOGIN_PATH);
  if (stage === "verified") redirect(ADMIN_HOME_PATH);
}

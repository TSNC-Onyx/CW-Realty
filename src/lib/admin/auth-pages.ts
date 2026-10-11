import "server-only";

import type { AuthError } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { reportAuthProblem } from "@/lib/admin/auth-problems";
import { ADMIN_LOGIN_PATH } from "@/lib/admin/paths";
import { getAuthErrorCode, isAuthOutage } from "@/lib/observability/auth-outage";
import { createSessionClient } from "@/lib/supabase/server-client";

// Checks shared by the sign-in step pages. A sign-in service outage is recorded and
// explained on the sign-in page; it never looks like being signed out
// (docs/cwr-error-tracking-plan.md, Auth).

export const AUTH_UNAVAILABLE_REASON = "auth-unavailable";
const AUTH_UNAVAILABLE_PATH = `${ADMIN_LOGIN_PATH}?reason=${AUTH_UNAVAILABLE_REASON}`;

/** unavailable: the sign-in service didn't answer, so the stage is unknown. */
export type SignInStage = "signed-out" | "signed-in" | "unavailable";

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
  return data?.claims ? "signed-in" : "signed-out";
}

/** Sends the person to the outage notice when the sign-in service didn't answer. */
export function requireAvailableStage(stage: SignInStage): void {
  if (stage === "unavailable") redirect(AUTH_UNAVAILABLE_PATH);
}

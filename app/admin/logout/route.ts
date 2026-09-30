import { NextResponse, type NextRequest } from "next/server";

import { reportAuthProblem } from "@/lib/admin/auth-problems";
import { ADMIN_LOGIN_PATH, type SignOutReason } from "@/lib/admin/paths";
import { ACTIVITY_COOKIE } from "@/lib/admin/session-timing";
import { getAuthErrorCode } from "@/lib/observability/auth-outage";
import { createSessionClient } from "@/lib/supabase/server-client";

// Signs out this browser and returns to the sign-in page with a reason it can explain.
// A failed sign-out is recorded; the person is still sent to the sign-in page.

const REASONS: SignOutReason[] = ["timeout", "signed-out", "no-access"];

function getReason(request: NextRequest): SignOutReason {
  const reason = request.nextUrl.searchParams.get("reason") as SignOutReason | null;
  return reason && REASONS.includes(reason) ? reason : "signed-out";
}

async function signOut(request: NextRequest): Promise<NextResponse> {
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) await reportAuthProblem({ action: "auth.sign_out", error, outcome: { severity: "warning", code: getAuthErrorCode(error) } });
  const response = NextResponse.redirect(new URL(`${ADMIN_LOGIN_PATH}?reason=${getReason(request)}`, request.url), 303);
  response.cookies.delete({ name: ACTIVITY_COOKIE, path: "/admin" });
  return response;
}

// POST only, so another site cannot sign an admin out with a link.
export const POST = signOut;

import type { AuthError, EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { getEmailLinkOutcome } from "@/lib/admin/auth-outcomes";
import { reportAuthProblem } from "@/lib/admin/auth-problems";
import { ADMIN_LOGIN_PATH, ADMIN_SET_PASSWORD_PATH } from "@/lib/admin/paths";
import type { ProblemAction } from "@/lib/observability/problem-catalog";
import { reportProblem } from "@/lib/observability/report-problem";
import { createSessionClient } from "@/lib/supabase/server-client";

// Finishes an emailed invite or password-reset link: the one-time token hash is checked
// on the server, then the person chooses a password. A link that doesn't work is recorded
// (never its token) and explained on the sign-in page.

const EMAIL_LINK_ACTION: ProblemAction = "auth.open_email_link";
const INCOMPLETE_LINK_CODE = "incomplete_link";
const LINK_EXPIRED_PATH = `${ADMIN_LOGIN_PATH}?reason=link-expired`;
// Only invite and reset links are accepted. Sign-in links and sign-up confirmations are never
// offered by the site, so a link Supabase makes for them must not sign anyone in (owner approved
// 2026-10-10, docs/cwr-branded-email-templates-plan.md, Phase 2).
const ACCEPTED_TYPES: EmailOtpType[] = ["invite", "recovery"];

function getRedirect(request: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

async function reportIncompleteLink(request: NextRequest): Promise<NextResponse> {
  await reportProblem({ action: EMAIL_LINK_ACTION, stage: "auth", severity: "info", code: INCOMPLETE_LINK_CODE });
  return getRedirect(request, LINK_EXPIRED_PATH);
}

async function reportRejectedLink(request: NextRequest, error: AuthError): Promise<NextResponse> {
  await reportAuthProblem({ action: EMAIL_LINK_ACTION, error, outcome: getEmailLinkOutcome(error) });
  return getRedirect(request, LINK_EXPIRED_PATH);
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  if (!tokenHash || !type || !ACCEPTED_TYPES.includes(type)) return reportIncompleteLink(request);
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return reportRejectedLink(request, error);
  return getRedirect(request, ADMIN_SET_PASSWORD_PATH);
}

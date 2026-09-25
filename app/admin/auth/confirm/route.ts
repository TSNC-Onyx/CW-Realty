import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { ADMIN_HOME_PATH, ADMIN_LOGIN_PATH, ADMIN_SET_PASSWORD_PATH } from "@/lib/admin/paths";
import { createSessionClient } from "@/lib/supabase/server-client";

// Finishes an emailed invite or password-reset link: the one-time token hash is checked
// on the server, then the person chooses a password.

const SET_PASSWORD_TYPES: EmailOtpType[] = ["invite", "recovery"];
const ACCEPTED_TYPES: EmailOtpType[] = [...SET_PASSWORD_TYPES, "email"];

function getRedirect(request: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  if (!tokenHash || !type || !ACCEPTED_TYPES.includes(type)) return getRedirect(request, `${ADMIN_LOGIN_PATH}?reason=link-expired`);
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return getRedirect(request, `${ADMIN_LOGIN_PATH}?reason=link-expired`);
  return getRedirect(request, SET_PASSWORD_TYPES.includes(type) ? ADMIN_SET_PASSWORD_PATH : ADMIN_HOME_PATH);
}

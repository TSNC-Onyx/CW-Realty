import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { JwtPayload } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";

import {
  ABSOLUTE_LIMIT_MS,
  ACTIVITY_COOKIE,
  getLastActivityAtMs,
  getLatestAuthAtMs,
  getSignedInAtMs,
  isSessionExpired,
  type AuthMethodStamp,
} from "@/lib/admin/session-timing";
import { getAuthErrorCode, isAuthOutage } from "@/lib/observability/auth-outage";

// Refreshes the admin session cookies on every /admin request (the @supabase/ssr
// middleware pattern) and applies the idle and maximum session limits. A sign-in service
// outage is reported as such instead of silently signing everyone out; an unreadable
// session is signed out as before (docs/cwr-error-tracking-plan.md).

type PendingCookie = { name: string; value: string; options: CookieOptions };

/** outage: the sign-in service failed. invalid: the session could not be read at all. */
export type SessionProblem = { kind: "outage" | "invalid"; code: string };

export type AdminSessionCheck = {
  isSignedIn: boolean;
  isExpired: boolean;
  problem: SessionProblem | null;
  applyCookies: (response: NextResponse) => void;
};

type ClaimsCheck = { claims: JwtPayload | null; problem: SessionProblem | null };

const SIGNED_OUT_CHECK: AdminSessionCheck = { isSignedIn: false, isExpired: false, problem: null, applyCookies: () => undefined };

function getActivityCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    // Outlives the idle limit so an idle session is detected, not forgotten.
    maxAge: ABSOLUTE_LIMIT_MS / 1000,
  };
}

async function readClaims(supabase: ReturnType<typeof createServerClient>): Promise<ClaimsCheck> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error && isAuthOutage(error)) return { claims: null, problem: { kind: "outage", code: getAuthErrorCode(error) } };
    return { claims: data?.claims ?? null, problem: null };
  } catch (error) {
    if (isAuthOutage(error)) return { claims: null, problem: { kind: "outage", code: getAuthErrorCode(error) } };
    // auth-js throws (instead of returning) for tokens it cannot even verify, such as a forged one.
    return { claims: null, problem: { kind: "invalid", code: getAuthErrorCode(error) } };
  }
}

async function fetchClaims(request: NextRequest, pendingCookies: PendingCookie[]): Promise<ClaimsCheck> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return { claims: null, problem: null };
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        pendingCookies.push(...cookiesToSet);
      },
    },
  });
  return readClaims(supabase);
}

export async function checkAdminSession(request: NextRequest, nowMs: number): Promise<AdminSessionCheck> {
  const pendingCookies: PendingCookie[] = [];
  const { claims, problem } = await fetchClaims(request, pendingCookies);
  // During an outage the session is kept as it is, so people stay signed in once it passes.
  if (problem?.kind === "outage") return { ...SIGNED_OUT_CHECK, problem };
  if (problem) return { ...SIGNED_OUT_CHECK, problem, applyCookies: (response) => clearSessionCookies(request, response) };
  if (!claims) return { ...SIGNED_OUT_CHECK, applyCookies: (response) => setCookies(response, pendingCookies) };
  const authMethods = claims.amr as AuthMethodStamp[] | undefined;
  const isExpired = isSessionExpired({
    signedInAtMs: getSignedInAtMs(authMethods),
    lastActivityAtMs: getLastActivityAtMs(request.cookies.get(ACTIVITY_COOKIE)?.value) ?? getLatestAuthAtMs(authMethods),
    nowMs,
  });
  const activityCookie = { name: ACTIVITY_COOKIE, value: String(nowMs), options: getActivityCookieOptions() };
  if (isExpired) return { isSignedIn: true, isExpired, problem: null, applyCookies: (response) => clearSessionCookies(request, response) };
  return { isSignedIn: true, isExpired, problem: null, applyCookies: (response) => setCookies(response, [...pendingCookies, activityCookie]) };
}

function setCookies(response: NextResponse, cookies: PendingCookie[]): void {
  cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
}

// An expired session is ended here: the browser's Supabase session cookies and the
// activity cookie are removed, so the next request starts at sign-in.
function clearSessionCookies(request: NextRequest, response: NextResponse): void {
  request.cookies.getAll().filter(({ name }) => name.startsWith("sb-")).forEach(({ name }) => response.cookies.delete(name));
  response.cookies.delete({ name: ACTIVITY_COOKIE, path: "/admin" });
}

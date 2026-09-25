import { createServerClient, type CookieOptions } from "@supabase/ssr";
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

// Refreshes the admin session cookies on every /admin request (the @supabase/ssr
// middleware pattern) and applies the idle and maximum session limits.

type PendingCookie = { name: string; value: string; options: CookieOptions };

export type AdminSessionCheck = {
  isSignedIn: boolean;
  isExpired: boolean;
  applyCookies: (response: NextResponse) => void;
};

const SIGNED_OUT_CHECK: AdminSessionCheck = { isSignedIn: false, isExpired: false, applyCookies: () => undefined };

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

async function fetchClaims(request: NextRequest, pendingCookies: PendingCookie[]) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return null;
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        pendingCookies.push(...cookiesToSet);
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  return data?.claims ?? null;
}

export async function checkAdminSession(request: NextRequest, nowMs: number): Promise<AdminSessionCheck> {
  const pendingCookies: PendingCookie[] = [];
  const claims = await fetchClaims(request, pendingCookies);
  if (!claims) return { ...SIGNED_OUT_CHECK, applyCookies: (response) => setCookies(response, pendingCookies) };
  const authMethods = claims.amr as AuthMethodStamp[] | undefined;
  const isExpired = isSessionExpired({
    signedInAtMs: getSignedInAtMs(authMethods),
    lastActivityAtMs: getLastActivityAtMs(request.cookies.get(ACTIVITY_COOKIE)?.value) ?? getLatestAuthAtMs(authMethods),
    nowMs,
  });
  const activityCookie = { name: ACTIVITY_COOKIE, value: String(nowMs), options: getActivityCookieOptions() };
  if (isExpired) return { isSignedIn: true, isExpired, applyCookies: (response) => clearSessionCookies(request, response) };
  return { isSignedIn: true, isExpired, applyCookies: (response) => setCookies(response, [...pendingCookies, activityCookie]) };
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

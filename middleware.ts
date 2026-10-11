import { NextResponse, type NextRequest } from "next/server";

import { ADMIN_LOGIN_PATH, isAdminPath, isPublicAdminPath } from "@/lib/admin/paths";
import { checkAdminSession, type SessionProblem } from "@/lib/admin/session-middleware";
import { createJobDatabase } from "@/lib/jobs/alert-jobs";
import { recordProblem } from "@/lib/observability/record-problem";
import { REQUEST_ID_HEADER, getRequestId } from "@/lib/observability/request-id";
import { fetchRedirectDecision, type RedirectDecision } from "@/lib/redirects/lookup";
import { getNormalizedUrl } from "@/lib/redirects/normalize";
import {
  CONTENT_SECURITY_POLICY_HEADER,
  NONCE_HEADER,
  createNonce,
  getContentSecurityPolicy,
} from "@/lib/security/content-security-policy";
import { getTagServerOrigin } from "@/lib/tracking/tag-server";

const NORMALIZATION_STATUS = 301;
const REDIRECT_LOOKUP_DEADLINE_MS = 1500;
const INTERNAL_HEADER_PREFIX = "x-cwr-";

class RedirectLookupTimeoutError extends Error {
  constructor(readonly context: { path: string; deadlineMs: number }) {
    super(`Redirect lookup took longer than ${context.deadlineMs} ms`);
    this.name = "RedirectLookupTimeoutError";
  }
}

async function fetchRedirectDecisionWithinDeadline(path: string): Promise<RedirectDecision | null> {
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    deadlineTimer = setTimeout(
      () => reject(new RedirectLookupTimeoutError({ path, deadlineMs: REDIRECT_LOOKUP_DEADLINE_MS })),
      REDIRECT_LOOKUP_DEADLINE_MS,
    );
  });
  try {
    return await Promise.race([fetchRedirectDecision(path), deadline]);
  } finally {
    clearTimeout(deadlineTimer);
  }
}

// A slow or failing database must never block a page: one shared deadline covers
// every lookup call; on failure the error is logged and the request served (Infra §3).
async function fetchRedirectDecisionOrNull(path: string, requestId: string): Promise<RedirectDecision | null> {
  try {
    return await fetchRedirectDecisionWithinDeadline(path);
  } catch (error) {
    console.error(JSON.stringify({ message: "Redirect lookup failed", requestId, path, error: String(error) }));
    return null;
  }
}

function getRedirectResponse(targetUrl: URL, status: number, requestId: string): NextResponse {
  const response = NextResponse.redirect(targetUrl, status);
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

// Every redirect is a single hop: normalization and the stored redirect are
// combined before one response is sent, and the query string is always kept.
async function getSingleHopRedirect(request: NextRequest, requestId: string): Promise<NextResponse | null> {
  const requestUrl = new URL(request.url);
  const normalizedUrl = getNormalizedUrl(requestUrl);
  const decision = await fetchRedirectDecisionOrNull(normalizedUrl.pathname, requestId);
  if (decision) {
    const targetUrl = new URL(normalizedUrl.href);
    targetUrl.pathname = decision.targetPath;
    return getRedirectResponse(targetUrl, decision.status, requestId);
  }
  if (normalizedUrl.href === requestUrl.href) return null;
  return getRedirectResponse(normalizedUrl, NORMALIZATION_STATUS, requestId);
}

function getPageResponse(request: NextRequest, { requestId, isAdmin }: { requestId: string; isAdmin: boolean }): NextResponse {
  const nonce = createNonce();
  const contentSecurityPolicy = getContentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV === "development",
    supabaseOrigin: process.env.NEXT_PUBLIC_SUPABASE_URL,
    allowWebAssembly: isAdmin,
    allowLocalMedia: isAdmin,
    allowTrackers: !isAdmin,
    tagServerOrigin: getTagServerOrigin(process.env.TAG_SERVER_URL),
  });

  const requestHeaders = new Headers(request.headers);
  // Headers the site sets for itself are never taken from the visitor.
  [...requestHeaders.keys()].filter((name) => name.startsWith(INTERNAL_HEADER_PREFIX)).forEach((name) => requestHeaders.delete(name));
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  requestHeaders.set(CONTENT_SECURITY_POLICY_HEADER, contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(CONTENT_SECURITY_POLICY_HEADER, contentSecurityPolicy);
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

function getAdminRedirect(request: NextRequest, path: string): NextResponse {
  const targetUrl = new URL(path, request.url);
  return NextResponse.redirect(targetUrl, 303);
}

// A sign-in service outage is critical; an unreadable session (for example a forged cookie)
// is only noted, since any visitor can send one. Recorded before answering, bounded by the
// recorder's own time limit (docs/cwr-error-tracking-plan.md).
async function recordSessionProblem({ problem, requestId, pathname }: { problem: SessionProblem; requestId: string; pathname: string }): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const db = url && serviceRoleKey ? createJobDatabase({ url, serviceRoleKey }) : null;
  const isOutage = problem.kind === "outage";
  await recordProblem(db, {
    action: isOutage ? "auth.session_check" : "auth.session_check_invalid",
    stage: "auth",
    severity: isOutage ? "critical" : "warning",
    origin: "server_signin",
    code: problem.code,
    requestId,
    pagePath: pathname,
  });
}

// Admin pages: refresh the session, send signed-out visitors to sign-in, end sessions
// past the idle or maximum limit, and never let a browser or proxy cache the page.
async function getAdminResponse(request: NextRequest, requestId: string): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const session = await checkAdminSession(request, Date.now());
  if (session.problem) await recordSessionProblem({ problem: session.problem, requestId, pathname });
  const response = getAdminRoute({ request, session, pathname, search, requestId });
  session.applyCookies(response);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function getAdminRoute({ request, session, pathname, search, requestId }: {
  request: NextRequest;
  session: Awaited<ReturnType<typeof checkAdminSession>>;
  pathname: string;
  search: string;
  requestId: string;
}): NextResponse {
  if (session.isExpired && !isPublicAdminPath(pathname)) return getAdminRedirect(request, `${ADMIN_LOGIN_PATH}?reason=timeout`);
  if (session.problem?.kind === "outage" && !isPublicAdminPath(pathname)) return getAdminRedirect(request, `${ADMIN_LOGIN_PATH}?reason=auth-unavailable`);
  if (!session.isSignedIn && !isPublicAdminPath(pathname)) {
    return getAdminRedirect(request, `${ADMIN_LOGIN_PATH}?next=${encodeURIComponent(pathname + search)}`);
  }
  return getPageResponse(request, { requestId, isAdmin: true });
}

// Next.js 16 prefers proxy.ts, but OpenNext for Cloudflare only supports the
// edge-runtime middleware.ts; proxy.ts (Node runtime) is experimental there.
export async function middleware(request: NextRequest) {
  // Admin requests always get a server-made request ID, so problem records can't be linked to a forged one.
  const isAdmin = isAdminPath(request.nextUrl.pathname);
  const requestId = getRequestId(isAdmin ? null : request.headers.get(REQUEST_ID_HEADER));
  const redirectResponse = await getSingleHopRedirect(request, requestId);
  if (redirectResponse) return redirectResponse;
  if (isAdmin) return getAdminResponse(request, requestId);
  return getPageResponse(request, { requestId, isAdmin: false });
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|photo-encoder|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

import { NextResponse, type NextRequest } from "next/server";

import { REQUEST_ID_HEADER, getRequestId } from "@/lib/observability/request-id";
import {
  CONTENT_SECURITY_POLICY_HEADER,
  NONCE_HEADER,
  createNonce,
  getContentSecurityPolicy,
} from "@/lib/security/content-security-policy";

// Next.js 16 prefers proxy.ts, but OpenNext for Cloudflare only supports the
// edge-runtime middleware.ts; proxy.ts (Node runtime) is experimental there.
export function middleware(request: NextRequest) {
  const nonce = createNonce();
  const requestId = getRequestId(request.headers.get(REQUEST_ID_HEADER));
  const contentSecurityPolicy = getContentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV === "development",
    supabaseOrigin: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  requestHeaders.set(CONTENT_SECURITY_POLICY_HEADER, contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(CONTENT_SECURITY_POLICY_HEADER, contentSecurityPolicy);
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

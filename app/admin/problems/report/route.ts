import { headers } from "next/headers";
import { z } from "zod";

import { ADMIN_FORGOT_PASSWORD_PATH, ADMIN_LOGIN_PATH, ADMIN_MFA_PATH, ADMIN_MFA_SETUP_PATH, ADMIN_SET_PASSWORD_PATH, isAdminPath } from "@/lib/admin/paths";
import { BROWSER_PROBLEM_CODES, BROWSER_PROBLEM_STAGES } from "@/lib/observability/client-problem";
import { isAuthOutage } from "@/lib/observability/auth-outage";
import { isProblemAction, type ProblemAction } from "@/lib/observability/problem-catalog";
import { getCappedSeverity, getVisitorBrowserCode, isBrowserReportable, isSameSiteOrigin, isVisitorBrowserAction } from "@/lib/observability/problem-report-rules";
import type { ProblemOrigin, ProblemSeverity } from "@/lib/observability/problem-types";
import { reportProblem } from "@/lib/observability/report-problem";
import { getPathOnly } from "@/lib/observability/scrub";
import { isOverProblemReportLimit } from "@/lib/security/rate-limit";
import { fetchVisitor } from "@/lib/security/visitor";
import { createServiceClient, isServiceAccessConfigured } from "@/lib/supabase/service-client";
import { createSessionClient } from "@/lib/supabase/server-client";
import { CWR_TENANT_SLUG } from "@/lib/supabase/public-client";

// Browsers report problems they saw here (docs/cwr-error-tracking-plan.md). The server, not
// the browser, decides who reported it: a signed-in team member, someone on a sign-in page,
// or a website visitor (docs/cwr-reliability-round-plan.md, Phase 1: a fixed list of actions
// and codes, no free text, capped at warning). Reports are same-site only, size-capped, rate-limited, and severity-capped. This
// endpoint never reports its own failures.

const MAX_BODY_BYTES = 8 * 1024;
const SIGN_IN_PAGES = new Set([ADMIN_LOGIN_PATH, ADMIN_FORGOT_PASSWORD_PATH, ADMIN_MFA_PATH, ADMIN_MFA_SETUP_PATH, ADMIN_SET_PASSWORD_PATH]);

const reportSchema = z.object({
  id: z.uuid(),
  action: z.string().max(80),
  stage: z.enum(BROWSER_PROBLEM_STAGES),
  severity: z.enum(["info", "warning", "error", "critical"]),
  code: z.string().max(40).transform((code) => ((BROWSER_PROBLEM_CODES as readonly string[]).includes(code) ? code : "other")),
  shownMessage: z.string().max(300).optional(),
  detail: z.string().max(2000).optional(),
  pagePath: z.string().max(300),
  digest: z.string().max(64).optional(),
});

type Reporter = { origin: ProblemOrigin; tenantId: string | null; actorId: string | null; actorRole: string | null; maxSeverity: ProblemSeverity };

type ParsedReport = z.infer<typeof reportSchema> & { action: ProblemAction };

const SIGN_IN_REPORTER: Reporter = { origin: "browser_signin", tenantId: null, actorId: null, actorRole: null, maxSeverity: "warning" };
const VISITOR_REPORTER: Reporter = { origin: "browser_visitor", tenantId: null, actorId: null, actorRole: null, maxSeverity: "warning" };

/** member: signed in with access. unknown: the check itself failed (an outage). none: signed out. */
type MemberCheck = { kind: "member"; reporter: Reporter } | { kind: "unknown" } | { kind: "none" };

async function fetchMemberCheck(): Promise<MemberCheck> {
  const supabase = await createSessionClient();
  const { data, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError && isAuthOutage(claimsError)) return { kind: "unknown" };
  const userId = claimsError ? null : data?.claims.sub;
  if (!userId) return { kind: "none" };
  const { data: membership, error } = await supabase
    .from("memberships")
    .select("role, tenant_id, tenants!inner(slug)")
    .eq("user_id", userId)
    .eq("tenants.slug", CWR_TENANT_SLUG)
    .maybeSingle<{ role: string; tenant_id: string }>();
  if (error) return { kind: "unknown" };
  if (!membership) return { kind: "none" };
  return { kind: "member", reporter: { origin: "browser_member", tenantId: membership.tenant_id, actorId: userId, actorRole: membership.role, maxSeverity: "error" } };
}

async function isSameSiteRequest(): Promise<boolean> {
  const headerStore = await headers();
  return isSameSiteOrigin({ origin: headerStore.get("origin"), host: headerStore.get("host") });
}

async function fetchExistingReference(digest: string | undefined): Promise<string | null> {
  if (!digest || !isServiceAccessConfigured()) return null;
  const { data, error } = await createServiceClient().from("problem_events").select("reference").eq("digest", digest).limit(1).maybeSingle<{ reference: string }>();
  return error ? null : (data?.reference ?? null);
}

// During a database or sign-in outage a member's report is still kept, capped like one from a
// sign-in page, instead of being refused for want of a readable session.
async function fetchReporter(pagePath: string | null): Promise<Reporter | null> {
  const check = await fetchMemberCheck();
  if (check.kind === "member") return check.reporter;
  if (check.kind === "unknown") return SIGN_IN_REPORTER;
  return pagePath && SIGN_IN_PAGES.has(pagePath) ? SIGN_IN_REPORTER : null;
}

async function parseReport(request: Request): Promise<ParsedReport | null> {
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return null;
  try {
    const parsed = reportSchema.safeParse(JSON.parse(body));
    if (!parsed.success || !isProblemAction(parsed.data.action) || !isBrowserReportable(parsed.data.action)) return null;
    return { ...parsed.data, action: parsed.data.action };
  } catch {
    return null;
  }
}

/** A visitor's report keeps only the fixed fields: anything typed could be anyone's words. */
function getVisitorReport(report: ParsedReport): ParsedReport {
  return { ...report, code: getVisitorBrowserCode(report.code), shownMessage: undefined, detail: undefined, digest: undefined };
}

/** A website page (not the admin portal) reporting one of the visitor actions. */
function isVisitorReport({ report, pagePath }: { report: ParsedReport; pagePath: string | null }): boolean {
  return isVisitorBrowserAction(report.action) && pagePath !== null && !isAdminPath(pagePath);
}

async function getRecordedResponse({ report, reporter, pagePath }: { report: ParsedReport; reporter: Reporter; pagePath: string | null }): Promise<Response> {
  const existingReference = await fetchExistingReference(report.digest);
  if (existingReference) return Response.json({ reference: existingReference, isStored: true });
  const result = await reportProblem({
    problemId: report.id,
    action: report.action,
    stage: report.stage,
    severity: getCappedSeverity(report.severity, reporter.maxSeverity),
    code: report.code,
    shownMessage: report.shownMessage,
    detail: report.detail,
    digest: report.digest,
    pagePath,
    origin: reporter.origin,
    tenantId: reporter.tenantId,
    actorId: reporter.actorId,
    actorRole: reporter.actorRole,
  });
  // Visitors never see reference codes, so none is sent back to their browsers.
  const reference = reporter.origin === "browser_visitor" ? null : result.reference;
  return Response.json({ reference, isStored: result.stored === true });
}

async function getReportResponse(request: Request): Promise<Response> {
  if (!(await isSameSiteRequest())) return new Response(null, { status: 403 });
  if (await isOverProblemReportLimit((await fetchVisitor()).ip)) return new Response(null, { status: 429 });
  const report = await parseReport(request);
  if (!report) return new Response(null, { status: 400 });
  const pagePath = getPathOnly(report.pagePath);
  if (isVisitorReport({ report, pagePath })) return getRecordedResponse({ report: getVisitorReport(report), reporter: VISITOR_REPORTER, pagePath });
  const reporter = await fetchReporter(pagePath);
  if (!reporter) return new Response(null, { status: 401 });
  return getRecordedResponse({ report, reporter, pagePath });
}

// Boundary: this endpoint never reports its own failures (no loops, and nothing a visitor
// sends can turn into a server crash record).
export async function POST(request: Request): Promise<Response> {
  try {
    return await getReportResponse(request);
  } catch {
    return new Response(null, { status: 500 });
  }
}

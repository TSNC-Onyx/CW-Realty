import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { ADMIN_HOME_PATH, ADMIN_LOGIN_PATH } from "@/lib/admin/paths";
import type { AdminRole } from "@/lib/admin/require-admin-roles";
import { setActionActor } from "@/lib/observability/action-context";
import { getAuthErrorCode, isAuthOutage } from "@/lib/observability/auth-outage";
import type { ProblemStage } from "@/lib/observability/problem-types";
import { getReferenceSuffix } from "@/lib/observability/reference";
import { reportProblem } from "@/lib/observability/report-problem";
import { ReportedProblemError } from "@/lib/observability/reported-problem-error";
import { createSessionClient, type SessionClient } from "@/lib/supabase/server-client";
import { CWR_TENANT_SLUG } from "@/lib/supabase/public-client";

// Service-layer check for every admin page and server action (Infra §2 "tenant isolation
// in both the service layer and the database"): signed in with email and password (no
// authenticator code since 2026-10-09, docs/cwr-password-only-sign-in-plan.md), a member of
// the CWR tenant, and holding one of the allowed roles.

export { ALL_ROLES, EDITOR_ROLES, OWNER_ROLES, type AdminRole } from "@/lib/admin/require-admin-roles";

export type AdminContext = {
  supabase: SessionClient;
  userId: string;
  email: string;
  role: AdminRole;
  tenantId: string;
};

export class AdminAccessError extends Error {
  constructor(readonly context: { reason: "role"; role: AdminRole; allowed: AdminRole[] }) {
    super("Your role cannot use this part of the admin portal");
    this.name = "AdminAccessError";
  }
}

const ACCESS_CHECK_MESSAGE = "We couldn't check your access right now. Try again in a moment.";

// A failed check is never mistaken for "no access" or "signed out": it is
// recorded as critical and shown with a reference code (docs/cwr-error-tracking-plan.md).
async function throwAccessCheckProblem({ stage, code }: { stage: ProblemStage; code: string }): Promise<never> {
  const result = await reportProblem({ action: "auth.access_check", stage, severity: "critical", code, shownMessage: ACCESS_CHECK_MESSAGE });
  throw new ReportedProblemError(`${ACCESS_CHECK_MESSAGE}${getReferenceSuffix({ reference: result.reference, isStored: result.stored === true })}`, { reference: result.reference });
}

async function fetchMembership(supabase: SessionClient, userId: string) {
  const { data: membership, error } = await supabase
    .from("memberships")
    .select("role, tenant_id, tenants!inner(slug)")
    .eq("user_id", userId)
    .eq("tenants.slug", CWR_TENANT_SLUG)
    .maybeSingle<{ role: AdminRole; tenant_id: string }>();
  if (error) return throwAccessCheckProblem({ stage: "load", code: error.code ?? "database" });
  return membership;
}

async function fetchClaims(supabase: SessionClient) {
  const { data, error } = await supabase.auth.getClaims();
  if (error && isAuthOutage(error)) return throwAccessCheckProblem({ stage: "auth", code: getAuthErrorCode(error) });
  return data?.claims ?? null;
}

// Cached per request so a page and its layout share one check.
const fetchAdminContext = cache(async (): Promise<AdminContext> => {
  const supabase = await createSessionClient();
  const claims = await fetchClaims(supabase);
  if (!claims) redirect(ADMIN_LOGIN_PATH);
  const membership = await fetchMembership(supabase, claims.sub);
  if (!membership) redirect(`${ADMIN_LOGIN_PATH}?reason=no-access`);
  return {
    supabase,
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
    role: membership.role,
    tenantId: membership.tenant_id,
  };
});

/** Redirects to sign-in when needed; throws AdminAccessError for the wrong role. */
export async function requireAdmin(allowedRoles: AdminRole[]): Promise<AdminContext> {
  const context = await fetchAdminContext();
  setActionActor({ tenantId: context.tenantId, actorId: context.userId, actorRole: context.role });
  if (!allowedRoles.includes(context.role)) {
    throw new AdminAccessError({ reason: "role", role: context.role, allowed: allowedRoles });
  }
  return context;
}

/** For pages: the wrong role goes back to the dashboard with an explanation. */
export async function requireAdminPage(allowedRoles: AdminRole[]): Promise<AdminContext> {
  const context = await fetchAdminContext();
  if (allowedRoles.includes(context.role)) return context;
  await reportProblem({
    action: "portal.wrong_role",
    stage: "access",
    severity: "info",
    code: context.role,
    tenantId: context.tenantId,
    actorId: context.userId,
    actorRole: context.role,
  });
  redirect(`${ADMIN_HOME_PATH}?notice=role`);
}

export function hasRole(context: AdminContext, allowedRoles: AdminRole[]): boolean {
  return allowedRoles.includes(context.role);
}

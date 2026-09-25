import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { ADMIN_HOME_PATH, ADMIN_LOGIN_PATH, ADMIN_MFA_PATH, ADMIN_MFA_SETUP_PATH } from "@/lib/admin/paths";
import type { AdminRole } from "@/lib/admin/require-admin-roles";
import { createSessionClient, type SessionClient } from "@/lib/supabase/server-client";
import { CWR_TENANT_SLUG } from "@/lib/supabase/public-client";

// Service-layer check for every admin page and server action (Infra §2 "tenant isolation
// in both the service layer and the database"): signed in, authenticator-verified
// (aal2), a member of the CWR tenant, and holding one of the allowed roles.

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

async function getMfaPath(supabase: SessionClient): Promise<string> {
  const { data } = await supabase.auth.mfa.listFactors();
  const hasVerifiedFactor = (data?.totp ?? []).some((factor) => factor.status === "verified");
  return hasVerifiedFactor ? ADMIN_MFA_PATH : ADMIN_MFA_SETUP_PATH;
}

async function fetchMembership(supabase: SessionClient, userId: string) {
  const { data: membership } = await supabase
    .from("memberships")
    .select("role, tenant_id, tenants!inner(slug)")
    .eq("user_id", userId)
    .eq("tenants.slug", CWR_TENANT_SLUG)
    .maybeSingle<{ role: AdminRole; tenant_id: string }>();
  return membership;
}

// Cached per request so a page and its layout share one check.
const fetchAdminContext = cache(async (): Promise<AdminContext> => {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect(ADMIN_LOGIN_PATH);
  if (claims.aal !== "aal2") redirect(await getMfaPath(supabase));
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

/** Redirects to sign-in or MFA when needed; throws AdminAccessError for the wrong role. */
export async function requireAdmin(allowedRoles: AdminRole[]): Promise<AdminContext> {
  const context = await fetchAdminContext();
  if (!allowedRoles.includes(context.role)) {
    throw new AdminAccessError({ reason: "role", role: context.role, allowed: allowedRoles });
  }
  return context;
}

/** For pages: the wrong role goes back to the dashboard with an explanation. */
export async function requireAdminPage(allowedRoles: AdminRole[]): Promise<AdminContext> {
  const context = await fetchAdminContext();
  if (!allowedRoles.includes(context.role)) redirect(`${ADMIN_HOME_PATH}?notice=role`);
  return context;
}

export function hasRole(context: AdminContext, allowedRoles: AdminRole[]): boolean {
  return allowedRoles.includes(context.role);
}

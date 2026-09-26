import "server-only";

import type { AdminContext, AdminRole } from "@/lib/admin/require-admin";
import { createServiceClient, isServiceAccessConfigured } from "@/lib/supabase/service-client";

// People with access, with emails and sign-in code status from Supabase Auth
// (service role, owner-only page).

const MAX_USERS = 1000;

/** "unknown" when the service-role secret is missing and Supabase Auth cannot be read. */
export type SignInCodeStatus = "on" | "not-set-up" | "unknown";

export type AdminUser = { userId: string; email: string; role: AdminRole; signInCodes: SignInCodeStatus; isCurrentUser: boolean };

type AuthUser = { id: string; email?: string; factors?: { status: string }[] };

/** Auth accounts by user ID; empty when the service-role secret is missing, so the page still loads. */
async function fetchAuthUsers(): Promise<Map<string, AuthUser>> {
  if (!isServiceAccessConfigured()) return new Map();
  const { data } = await createServiceClient().auth.admin.listUsers({ page: 1, perPage: MAX_USERS });
  return new Map((data?.users ?? []).map((user) => [user.id, user]));
}

function getSignInCodeStatus({ user, isAuthReadable }: { user: AuthUser | undefined; isAuthReadable: boolean }): SignInCodeStatus {
  if (!isAuthReadable) return "unknown";
  return (user?.factors ?? []).some((factor) => factor.status === "verified") ? "on" : "not-set-up";
}

export async function fetchAdminUsers({ supabase, tenantId, userId }: AdminContext): Promise<AdminUser[]> {
  const { data: memberships } = await supabase.from("memberships").select("user_id, role").eq("tenant_id", tenantId).returns<{ user_id: string; role: AdminRole }[]>();
  const usersById = await fetchAuthUsers();
  const isAuthReadable = isServiceAccessConfigured();
  return (memberships ?? [])
    .map((membership) => {
      const user = usersById.get(membership.user_id);
      return {
        userId: membership.user_id,
        email: user?.email ?? "(unknown email)",
        role: membership.role,
        signInCodes: getSignInCodeStatus({ user, isAuthReadable }),
        isCurrentUser: membership.user_id === userId,
      };
    })
    .sort((first, second) => first.email.localeCompare(second.email));
}

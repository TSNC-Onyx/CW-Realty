import "server-only";

import { getLoaded, getLoadFailure, getQueryLoad, type LoadResult } from "@/lib/admin/load-result";
import type { AdminContext, AdminRole } from "@/lib/admin/require-admin";
import { createServiceClient, isServiceAccessConfigured } from "@/lib/supabase/service-client";

// People with access, with emails and sign-in code status from Supabase Auth
// (service role, owner-only page).

const MAX_USERS = 1000;
const UNKNOWN_EMAIL = "(unknown email)";
const EMAIL_NOT_LOADED = "(email didn't load)";

/**
 * "unknown" when the service-role secret is missing and Supabase Auth cannot be read;
 * "not-loaded" when reading Supabase Auth failed (never shown as "not set up").
 */
export type SignInCodeStatus = "on" | "not-set-up" | "unknown" | "not-loaded";

export type AdminUser = { userId: string; email: string; role: AdminRole; signInCodes: SignInCodeStatus; isCurrentUser: boolean };

/** users: the people with access; authAccounts: whether their emails and sign-in codes loaded. */
export type AdminUsersLoad = { users: LoadResult<AdminUser[]>; authAccounts: LoadResult<unknown> };

type AuthUser = { id: string; email?: string; factors?: { status: string }[] };

type Membership = { user_id: string; role: AdminRole };

/** null (loaded) when the service-role secret is missing, so the page still loads. */
type AuthUsersLoad = LoadResult<Map<string, AuthUser> | null>;

async function fetchAuthUsers(): Promise<AuthUsersLoad> {
  if (!isServiceAccessConfigured()) return getLoaded(null);
  const { data, error } = await createServiceClient().auth.admin.listUsers({ page: 1, perPage: MAX_USERS });
  if (error) return getLoadFailure("sign-in accounts", { code: error.code ?? error.name, message: error.message });
  return getLoaded(new Map(data.users.map((user) => [user.id, user])));
}

async function fetchMemberships({ supabase, tenantId }: AdminContext): Promise<LoadResult<Membership[]>> {
  const result = await supabase.from("memberships").select("user_id, role").eq("tenant_id", tenantId).returns<Membership[]>();
  return getQueryLoad({ part: "people with access", result, empty: [] });
}

function getSignInCodeStatus({ user, authUsers }: { user: AuthUser | undefined; authUsers: AuthUsersLoad }): SignInCodeStatus {
  if (!authUsers.isLoaded) return "not-loaded";
  if (!authUsers.data) return "unknown";
  return (user?.factors ?? []).some((factor) => factor.status === "verified") ? "on" : "not-set-up";
}

function getAdminUser({ membership, authUsers, currentUserId }: { membership: Membership; authUsers: AuthUsersLoad; currentUserId: string }): AdminUser {
  const user = authUsers.isLoaded ? authUsers.data?.get(membership.user_id) : undefined;
  return {
    userId: membership.user_id,
    email: authUsers.isLoaded ? (user?.email ?? UNKNOWN_EMAIL) : EMAIL_NOT_LOADED,
    role: membership.role,
    signInCodes: getSignInCodeStatus({ user, authUsers }),
    isCurrentUser: membership.user_id === currentUserId,
  };
}

export async function fetchAdminUsers(admin: AdminContext): Promise<AdminUsersLoad> {
  const [memberships, authUsers] = await Promise.all([fetchMemberships(admin), fetchAuthUsers()]);
  if (!memberships.isLoaded) return { users: memberships, authAccounts: authUsers };
  const users = memberships.data
    .map((membership) => getAdminUser({ membership, authUsers, currentUserId: admin.userId }))
    .sort((first, second) => first.email.localeCompare(second.email));
  return { users: getLoaded(users), authAccounts: authUsers };
}

import "server-only";

import type { AdminContext, AdminRole } from "@/lib/admin/require-admin";
import { createServiceClient } from "@/lib/supabase/service-client";

// People with access, with emails and sign-in code status from Supabase Auth
// (service role, owner-only page).

const MAX_USERS = 1000;

export type AdminUser = { userId: string; email: string; role: AdminRole; hasSignInCodes: boolean; isCurrentUser: boolean };

export async function fetchAdminUsers({ supabase, tenantId, userId }: AdminContext): Promise<AdminUser[]> {
  const { data: memberships } = await supabase.from("memberships").select("user_id, role").eq("tenant_id", tenantId).returns<{ user_id: string; role: AdminRole }[]>();
  const { data } = await createServiceClient().auth.admin.listUsers({ page: 1, perPage: MAX_USERS });
  const usersById = new Map((data?.users ?? []).map((user) => [user.id, user]));
  return (memberships ?? [])
    .map((membership) => {
      const user = usersById.get(membership.user_id);
      return {
        userId: membership.user_id,
        email: user?.email ?? "(unknown email)",
        role: membership.role,
        hasSignInCodes: (user?.factors ?? []).some((factor) => factor.status === "verified"),
        isCurrentUser: membership.user_id === userId,
      };
    })
    .sort((first, second) => first.email.localeCompare(second.email));
}

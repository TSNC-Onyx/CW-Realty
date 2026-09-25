import type { Metadata } from "next";

import { InviteForm } from "@/components/admin/users/invite-form";
import { UserList } from "@/components/admin/users/user-list";
import { OWNER_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { fetchAdminUsers } from "@/lib/admin/users/queries";

export const metadata: Metadata = { title: "Users & roles" };

export default async function UsersPage() {
  const admin = await requireAdminPage(OWNER_ROLES);
  const users = await fetchAdminUsers(admin);
  return (
    <>
      <h1 className="type-h1 mb-2">Users &amp; roles</h1>
      <p className="type-lead mb-10 max-w-prose text-muted">Everyone signs in with a password plus a code from an authenticator app. Changes apply right away.</p>
      <section aria-labelledby="invite-heading" className="mb-12 border-t-2 border-ink pt-6">
        <h2 id="invite-heading" className="type-h3 mb-4">Invite someone</h2>
        <InviteForm idempotencyKey={crypto.randomUUID()} />
      </section>
      <section aria-labelledby="people-heading" className="border-t-2 border-ink pt-6">
        <h2 id="people-heading" className="type-h3 mb-4">People with access</h2>
        <UserList users={users} />
      </section>
    </>
  );
}

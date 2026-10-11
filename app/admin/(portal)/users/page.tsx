import type { Metadata } from "next";

import { LoadProblem } from "@/components/admin/load-problem";
import { InviteForm } from "@/components/admin/users/invite-form";
import { UserList } from "@/components/admin/users/user-list";
import { reportPageLoad } from "@/lib/admin/report-page-load";
import { OWNER_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { fetchAdminUsers } from "@/lib/admin/users/queries";

export const metadata: Metadata = { title: "Users & roles" };

export default async function UsersPage() {
  const admin = await requireAdminPage(OWNER_ROLES);
  const { users, authAccounts } = await fetchAdminUsers(admin);
  const notice = await reportPageLoad({ admin, action: "users.load", results: [users, authAccounts] });
  return (
    <>
      <h1 className="type-h1 mb-2">Users &amp; roles</h1>
      <p className="type-lead mb-10 max-w-prose text-muted">Everyone signs in with their email and a password. Changes apply right away.</p>
      <section aria-labelledby="invite-heading" className="mb-12 border-t-2 border-ink pt-6">
        <h2 id="invite-heading" className="type-h3 mb-4">Invite someone</h2>
        <InviteForm idempotencyKey={crypto.randomUUID()} />
      </section>
      <section aria-labelledby="people-heading" className="border-t-2 border-ink pt-6">
        <h2 id="people-heading" className="type-h3 mb-4">People with access</h2>
        {users.isLoaded && !authAccounts.isLoaded && (
          <div className="mb-4">
            <LoadProblem notice={notice} title="Emails didn't load" />
          </div>
        )}
        {users.isLoaded ? <UserList users={users.data} /> : <LoadProblem notice={notice} />}
      </section>
    </>
  );
}

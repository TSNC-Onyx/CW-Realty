import { ButtonLink } from "@/components/ui/button-link";
import { recordPageNotFound } from "@/lib/admin/record-page-not-found";
import { ALL_ROLES, requireAdminPage } from "@/lib/admin/require-admin";

export default async function AdminNotFound() {
  await recordPageNotFound({ admin: await requireAdminPage(ALL_ROLES), path: null });
  return (
    <>
      <h1 className="type-h1 mb-4">That page isn&apos;t here</h1>
      <p className="mb-6 max-w-prose">It may have been moved to the trash, or the link is out of date.</p>
      <ButtonLink href="/admin" size="m" variant="main">Go to the dashboard</ButtonLink>
    </>
  );
}

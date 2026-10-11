import { ADMIN_HOME_PATH } from "@/lib/admin/paths";
import { showPageNotFound } from "@/lib/admin/record-page-not-found";
import { ALL_ROLES, requireAdminPage } from "@/lib/admin/require-admin";

// Unknown admin URLs show the admin "not found" page inside the portal frame, and are
// recorded with the address that was tried.

type MissingAdminPageProps = { params: Promise<{ missing: string[] }> };

export default async function MissingAdminPage({ params }: MissingAdminPageProps) {
  const admin = await requireAdminPage(ALL_ROLES);
  const { missing } = await params;
  return showPageNotFound({ admin, path: `${ADMIN_HOME_PATH}/${missing.join("/")}` });
}

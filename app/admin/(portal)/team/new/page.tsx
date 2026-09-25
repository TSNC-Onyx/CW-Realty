import type { Metadata } from "next";

import { TeamMemberForm } from "@/components/admin/team/team-member-form";
import { TextLink } from "@/components/ui/text-link";
import { EDITOR_ROLES, requireAdminPage } from "@/lib/admin/require-admin";

export const metadata: Metadata = { title: "Add team member" };

const EMPTY_MEMBER = { fullName: "", jobTitle: "", email: "", phone: "", bio: "", slug: "", isVisible: true };

export default async function NewTeamMemberPage() {
  await requireAdminPage(EDITOR_ROLES);
  return (
    <>
      <TextLink href="/admin/team">Back to team</TextLink>
      <h1 className="type-h1 mt-4 mb-2">Add team member</h1>
      <p className="type-lead mb-10 text-muted">You can add a photo after saving.</p>
      <TeamMemberForm mode="create" idempotencyKey={crypto.randomUUID()} defaults={EMPTY_MEMBER} />
    </>
  );
}

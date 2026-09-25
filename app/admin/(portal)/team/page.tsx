import { Plus, UserRound } from "lucide-react";
import type { Metadata } from "next";

import { TeamList } from "@/components/admin/team/team-list";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { TextLink } from "@/components/ui/text-link";
import { EDITOR_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { fetchAdminTeam } from "@/lib/admin/team/queries";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

export const metadata: Metadata = { title: "Team" };

export default async function AdminTeamPage() {
  const admin = await requireAdminPage(EDITOR_ROLES);
  const members = await fetchAdminTeam(admin);
  return (
    <>
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="type-h1 mb-2">Team</h1>
          <p className="type-lead text-muted">The order here is the order on the team page.</p>
          <TextLink href="/team" hasArrow>View the team page</TextLink>
        </div>
        <ButtonLink href="/admin/team/new" size="m" variant="main">
          <Plus aria-hidden size={ICON_SIZE.button} />
          Add team member
        </ButtonLink>
      </div>
      {members.length === 0 ? (
        <EmptyState
          icon={UserRound}
          titleId="team-empty"
          title="No team members yet"
          description="Add the people visitors can contact. Each one gets a profile page."
          action={<ButtonLink href="/admin/team/new" size="m" variant="main">Add team member</ButtonLink>}
        />
      ) : (
        <TeamList
          members={members.map((member) => ({
            id: member.id,
            fullName: member.full_name,
            jobTitle: member.job_title,
            isVisible: member.is_visible,
            hasPhoto: member.photo_path !== null,
          }))}
        />
      )}
    </>
  );
}

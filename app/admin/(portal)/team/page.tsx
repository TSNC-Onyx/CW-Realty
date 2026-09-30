import { Plus, UserRound } from "lucide-react";
import type { Metadata } from "next";

import { LoadProblem } from "@/components/admin/load-problem";
import { TeamList } from "@/components/admin/team/team-list";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { TextLink } from "@/components/ui/text-link";
import type { LoadResult } from "@/lib/admin/load-result";
import { reportPageLoad, type LoadProblemNotice } from "@/lib/admin/report-page-load";
import { EDITOR_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { fetchAdminTeam, type AdminTeamMember } from "@/lib/admin/team/queries";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

export const metadata: Metadata = { title: "Team" };

function TeamBody({ membersLoad, notice }: { membersLoad: LoadResult<AdminTeamMember[]>; notice: LoadProblemNotice | null }) {
  if (!membersLoad.isLoaded) return <LoadProblem notice={notice} />;
  const members = membersLoad.data;
  if (members.length === 0) {
    return (
      <EmptyState
        icon={UserRound}
        titleId="team-empty"
        title="No team members yet"
        description="Add the people visitors can contact. Each one gets a profile page."
        action={<ButtonLink href="/admin/team/new" size="m" variant="main">Add team member</ButtonLink>}
      />
    );
  }
  return (
    <TeamList
      members={members.map((member) => ({
        id: member.id,
        fullName: member.full_name,
        jobTitle: member.job_title,
        isVisible: member.is_visible,
        hasPhoto: member.photo_path !== null,
      }))}
    />
  );
}

export default async function AdminTeamPage() {
  const admin = await requireAdminPage(EDITOR_ROLES);
  const membersLoad = await fetchAdminTeam(admin);
  const notice = await reportPageLoad({ admin, action: "team.load", results: [membersLoad] });
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
      <TeamBody membersLoad={membersLoad} notice={notice} />
    </>
  );
}

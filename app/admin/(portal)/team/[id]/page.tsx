import type { Metadata } from "next";
import { z } from "zod";

import { LoadProblem } from "@/components/admin/load-problem";
import { TeamMemberForm } from "@/components/admin/team/team-member-form";
import { TeamPhoto } from "@/components/admin/team/team-photo";
import { Message } from "@/components/ui/message";
import { TextLink } from "@/components/ui/text-link";
import { showPageNotFound } from "@/lib/admin/record-page-not-found";
import { reportPageLoad, type LoadProblemNotice } from "@/lib/admin/report-page-load";
import { EDITOR_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { fetchAdminTeamMember, type AdminTeamMember } from "@/lib/admin/team/queries";
import { getDisplayPhone, type E164Phone } from "@/lib/site/phone";

export const metadata: Metadata = { title: "Edit team member" };

type EditTeamMemberPageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> };

function getPhoto(member: AdminTeamMember) {
  if (!member.photo_path || !member.photo_alt || !member.photo_width || !member.photo_height) return null;
  return { folder: member.photo_path, alt: member.photo_alt, width: member.photo_width, height: member.photo_height };
}

function MemberLoadProblem({ notice }: { notice: LoadProblemNotice | null }) {
  return (
    <>
      <TextLink href="/admin/team">Back to team</TextLink>
      <h1 className="type-h1 mt-4 mb-8">Edit team member</h1>
      <LoadProblem notice={notice} />
    </>
  );
}

export default async function EditTeamMemberPage({ params, searchParams }: EditTeamMemberPageProps) {
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  const admin = await requireAdminPage(EDITOR_ROLES);
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return showPageNotFound({ admin, path: `/admin/team/${id}` });
  const memberLoad = await fetchAdminTeamMember(admin, parsedId.data);
  const notice = await reportPageLoad({ admin, action: "team.load", results: [memberLoad] });
  if (!memberLoad.isLoaded) return <MemberLoadProblem notice={notice} />;
  const member = memberLoad.data;
  if (!member) return showPageNotFound({ admin, path: `/admin/team/${id}` });
  return (
    <>
      <TextLink href="/admin/team">Back to team</TextLink>
      <h1 className="type-h1 mt-4 mb-2">{member.full_name}</h1>
      <div className="mb-10">
        <TextLink href={`/team/${member.slug}`} hasArrow>View on the website</TextLink>
      </div>
      {created && (
        <div className="mb-8 max-w-prose">
          <Message tone="success" title="Team member added">
            <p>Add a photo below, or keep editing.</p>
          </Message>
        </div>
      )}
      <section aria-labelledby="photo-heading" className="mb-12 border-t-2 border-ink pt-6">
        <h2 id="photo-heading" className="type-h3 mb-4">Photo</h2>
        <TeamPhoto memberId={member.id} fullName={member.full_name} photo={getPhoto(member)} />
      </section>
      <TeamMemberForm
        mode="edit"
        memberId={member.id}
        defaults={{
          fullName: member.full_name,
          jobTitle: member.job_title,
          email: member.email ?? "",
          phone: member.phone ? getDisplayPhone(member.phone as E164Phone) : "",
          bio: member.bio,
          slug: member.slug,
          isVisible: member.is_visible,
        }}
      />
    </>
  );
}

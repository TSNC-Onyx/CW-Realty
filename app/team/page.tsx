import type { Metadata } from "next";

import { TeamCard } from "@/components/content/team-card";
import { PageIntro } from "@/components/ui/page-intro";
import { Section } from "@/components/ui/section";
import { fetchTeamMembers } from "@/lib/content/team";

export const metadata: Metadata = {
  title: "CWR team",
  description: "Meet the brokers and specialists of Charlie Ward Realty.",
};

export default async function TeamPage() {
  const members = await fetchTeamMembers();
  return (
    <>
      <PageIntro
        eyebrow="CWR team"
        title="Meet the people behind CWR"
        lead="A diverse team of professionals ready to help you buy, sell, or invest in real estate. Get to know them, then connect with the one who fits you best."
      />
      <Section labelledBy="team-heading">
        <h2 id="team-heading" className="sr-only">Team members</h2>
        {members.length === 0 ? (
          <p>Our team profiles are being updated. Please check back soon or contact us.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 md:gap-8 lg:grid-cols-4">
            {members.map((member) => (
              <li key={member.slug}>
                <TeamCard member={member} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

import { Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ResponsivePhoto } from "@/components/content/responsive-photo";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Prose } from "@/components/ui/prose";
import { Container, Section } from "@/components/ui/section";
import { TextLink } from "@/components/ui/text-link";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { getParagraphs } from "@/lib/content/format";
import { fetchTeamMemberBySlug, type TeamMember } from "@/lib/content/team";
import { getCallHref, getDisplayPhone } from "@/lib/site/phone";

// Hidden members never reach this page: the middleware answers 302 to /team first.

const PORTRAIT_SIZES = "(min-width: 1024px) 420px, 100vw";

type TeamMemberPageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: TeamMemberPageProps): Promise<Metadata> {
  const { slug } = await params;
  const member = await fetchTeamMemberBySlug(slug);
  if (!member) return { title: "Team member not found" };
  return {
    title: member.fullName,
    description: member.jobTitle ? `${member.fullName}, ${member.jobTitle} at Charlie Ward Realty.` : `${member.fullName} at Charlie Ward Realty.`,
    alternates: { canonical: `/team/${member.slug}` },
  };
}

function MemberContact({ member }: { member: TeamMember }) {
  if (!member.phone && !member.email) return null;
  const linkClass = "flex min-h-11 items-center gap-2 font-semibold underline underline-offset-4";
  return (
    <ul className="mt-6">
      {member.phone && (
        <li>
          <a href={getCallHref(member.phone)} className={linkClass}>
            <Phone aria-hidden size={ICON_SIZE.inline} />
            {getDisplayPhone(member.phone)}
          </a>
        </li>
      )}
      {member.email && (
        <li>
          <a href={`mailto:${member.email}`} className={`${linkClass} break-all`}>
            <Mail aria-hidden size={ICON_SIZE.inline} className="shrink-0" />
            {member.email}
          </a>
        </li>
      )}
    </ul>
  );
}

export default async function TeamMemberPage({ params }: TeamMemberPageProps) {
  const { slug } = await params;
  const member = await fetchTeamMemberBySlug(slug);
  if (!member) notFound();
  const paragraphs = getParagraphs(member.bio);
  return (
    <>
      <div className="bg-page pt-12 lg:pt-24">
        <Container className="grid gap-8 md:grid-cols-12 lg:gap-16">
          <div className="md:col-span-5 lg:col-span-4">
            <ResponsivePhoto photo={member.photo} ratio="portrait" sizes={PORTRAIT_SIZES} isPriority />
          </div>
          <div className="md:col-span-7 lg:col-span-7">
            <Eyebrow>CWR team</Eyebrow>
            <h1 className="type-h1">{member.fullName}</h1>
            {member.jobTitle && <p className="type-lead mt-2 text-muted">{member.jobTitle}</p>}
            <MemberContact member={member} />
          </div>
        </Container>
      </div>
      <Section labelledBy="member-about-heading">
        <Prose>
          <h2 id="member-about-heading">{`About ${member.fullName}`}</h2>
          {paragraphs.length > 0 ? (
            paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)
          ) : (
            <p>A full profile is coming soon. Contact us and we&apos;ll connect you.</p>
          )}
        </Prose>
        <div className="mt-8">
          <TextLink href="/team" hasArrow>See the full team</TextLink>
        </div>
      </Section>
    </>
  );
}

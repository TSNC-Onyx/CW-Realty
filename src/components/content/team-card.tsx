import Link from "next/link";

import { ResponsivePhoto } from "@/components/content/responsive-photo";
import type { TeamMember } from "@/lib/content/team";

// Style §11.10 team card: 4:5 portrait, name, role; the whole card is one link.

const PORTRAIT_SIZES = "(min-width: 1024px) 300px, 50vw";

export function TeamCard({ member }: { member: TeamMember }) {
  return (
    <Link href={`/team/${member.slug}`} className="group block">
      <ResponsivePhoto photo={member.photo} ratio="portrait" sizes={PORTRAIT_SIZES} />
      <p className="type-team-name mt-3 underline-offset-4 group-hover:underline">{member.fullName}</p>
      {member.jobTitle && <p className="text-base text-muted">{member.jobTitle}</p>}
    </Link>
  );
}

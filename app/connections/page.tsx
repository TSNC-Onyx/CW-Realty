import { Phone } from "lucide-react";
import type { Metadata } from "next";

import { PageIntro } from "@/components/ui/page-intro";
import { Section } from "@/components/ui/section";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { getCallHref, getDisplayPhone, type E164Phone } from "@/lib/site/phone";

// Partner directory from the current live Connections page (navigation-reconciliation #5).

export const metadata: Metadata = {
  title: "Connections",
  description: "Trusted local professionals Charlie Ward Realty refers clients to.",
};

type Partner = { name: string; role: string; phone: E164Phone };

const PARTNERS: Partner[] = [
  { name: "Vickie V. Foust", role: "Loan officer, NMLS 86956", phone: "+13362023409" },
  { name: "Kim Bates", role: "State Farm insurance agent", phone: "+13367686351" },
  { name: "Matthew Young", role: "GEICO insurance agent", phone: "+13368527283" },
];

export default function ConnectionsPage() {
  return (
    <>
      <PageIntro
        eyebrow="Resources"
        title="Connections"
        lead="Buying or selling takes a team. These are local professionals our clients have trusted for loans, insurance, and more."
      />
      <Section labelledBy="partners-heading">
        <h2 id="partners-heading" className="sr-only">Partners</h2>
        <ul className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {PARTNERS.map((partner) => (
            <li key={partner.name} className="border-t-2 border-ink pt-6">
              <h3 className="type-h3">{partner.name}</h3>
              <p className="mt-1 text-muted">{partner.role}</p>
              <a href={getCallHref(partner.phone)} className="mt-2 flex min-h-11 items-center gap-2 font-semibold underline underline-offset-4">
                <Phone aria-hidden size={ICON_SIZE.inline} />
                {`Call ${getDisplayPhone(partner.phone)}`}
              </a>
            </li>
          ))}
        </ul>
        <p className="type-small mt-10 max-w-prose text-muted">
          You are always free to choose any lender, insurer, or other provider. These referrals are offered for your
          convenience.
        </p>
      </Section>
    </>
  );
}

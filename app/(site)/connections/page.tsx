import { Globe, Handshake, Mail, Phone, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ResponsivePhoto } from "@/components/content/responsive-photo";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageIntro } from "@/components/ui/page-intro";
import { Section } from "@/components/ui/section";
import { fetchConnections, getCategoriesHeading, type Connection } from "@/lib/content/connections";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { CONTACT_PAGE_PATH } from "@/lib/site/contact-links";
import { fetchPageListing } from "@/lib/site/page-listing";
import { getCallHref, getDisplayPhone } from "@/lib/site/phone";

// Referral partners from Admin → Connections (navigation-reconciliation #5; owner-approved
// design with partner photos, 2026-09-26, docs/cwr-site-review-round-plan.md Step 8).
// While an owner has the page hidden, its address sends visitors to Resources with a temporary
// redirect, so search engines keep it for when it comes back (docs/cwr-connections-page-switch-plan.md).

export const metadata: Metadata = {
  title: "Connections",
  description: "Trusted local professionals Charlie Ward Realty refers clients to.",
};

const HIDDEN_PAGE_DESTINATION = "/resources";
const PORTRAIT_SIZES = "(min-width: 1024px) 416px, (min-width: 768px) 50vw, 100vw";
const LINK_CLASS = "flex min-h-11 items-center gap-2 font-semibold underline underline-offset-4";

// A database problem must not blank the page: it shows the referral box instead (Infra §3).
async function fetchConnectionsOrEmpty(): Promise<Connection[]> {
  try {
    return await fetchConnections();
  } catch (error) {
    console.error("Connections unavailable", error);
    return [];
  }
}

function ContactLink({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <a href={href} className={LINK_CLASS}>
      <Icon aria-hidden size={ICON_SIZE.inline} />
      {label}
    </a>
  );
}

function ConnectionCard({ connection }: { connection: Connection }) {
  return (
    <li className="border-t-2 border-ink pt-4">
      <ResponsivePhoto photo={connection.photo} ratio="portrait" sizes={PORTRAIT_SIZES} />
      <p className="type-small mt-4 font-semibold text-muted">{connection.category}</p>
      <h3 className="type-h3">{connection.fullName}</h3>
      {connection.titleLine && <p className="text-base text-muted">{connection.titleLine}</p>}
      {connection.phone && <ContactLink href={getCallHref(connection.phone)} icon={Phone} label={`Call ${getDisplayPhone(connection.phone)}`} />}
      {connection.email && <ContactLink href={`mailto:${connection.email}`} icon={Mail} label={`Email ${connection.fullName}`} />}
      {connection.website && <ContactLink href={connection.website} icon={Globe} label={`Visit ${connection.fullName}'s website`} />}
    </li>
  );
}

function ConnectionGrid({ connections }: { connections: Connection[] }) {
  if (connections.length === 0) {
    return (
      <EmptyState
        icon={Handshake}
        titleId="connections-empty-heading"
        title="Partner list coming soon"
        description="We're updating our list of trusted professionals. Ask us and we'll connect you with someone we trust."
        action={<ButtonLink href={CONTACT_PAGE_PATH} size="m" variant="main">Ask us for a referral</ButtonLink>}
      />
    );
  }
  return (
    <>
      <h2 id="partners-heading" className="type-h2-article mb-6">{getCategoriesHeading(connections)}</h2>
      <ul className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {connections.map((connection) => (
          <ConnectionCard key={connection.id} connection={connection} />
        ))}
      </ul>
    </>
  );
}

function ReferralBox() {
  return (
    <div className="mt-16 flex flex-col gap-6 border-t-2 border-ink bg-surface-soft p-6 md:flex-row md:items-center md:justify-between md:p-10">
      <div>
        <h2 className="type-h3">Need someone we haven&apos;t listed?</h2>
        <p className="mt-2 max-w-prose">Tell us what you need and we&apos;ll connect you with a professional we trust.</p>
      </div>
      <ButtonLink href={CONTACT_PAGE_PATH} size="m" variant="main" isFullWidthOnMobile>
        Ask us for a referral
      </ButtonLink>
    </div>
  );
}

export default async function ConnectionsPage() {
  const { isConnectionsPageVisible } = await fetchPageListing();
  if (!isConnectionsPageVisible) redirect(HIDDEN_PAGE_DESTINATION);
  const connections = await fetchConnectionsOrEmpty();
  return (
    <>
      <PageIntro
        eyebrow="Resources"
        title="Connections"
        lead="Buying or selling takes a team. These local professionals have helped our clients with loans, insurance, repairs, and more."
      >
        <p className="mt-4 max-w-prose">Reach out to them directly, or ask us and we&apos;ll gladly make the introduction.</p>
      </PageIntro>
      <Section labelledBy={connections.length > 0 ? "partners-heading" : "connections-empty-heading"}>
        <ConnectionGrid connections={connections} />
        {connections.length > 0 && <ReferralBox />}
        <p className="type-small mt-8 max-w-prose text-muted">
          You are always free to choose any lender, insurer, or other provider. These referrals are offered for your
          convenience.
        </p>
      </Section>
    </>
  );
}

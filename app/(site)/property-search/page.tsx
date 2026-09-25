import { Phone, Search } from "lucide-react";
import type { Metadata } from "next";

import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageIntro } from "@/components/ui/page-intro";
import { Section } from "@/components/ui/section";
import { TextLink } from "@/components/ui/text-link";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { CONTACT_PAGE_PATH, getContactLinks } from "@/lib/site/contact-links";
import { fetchSiteSettings } from "@/lib/site/site-settings";

// Placeholder until the Triad MLS search provider is chosen (owner decision).

export const metadata: Metadata = {
  title: "Property search",
  description: "Search homes for sale across the Triad with Charlie Ward Realty.",
};

export default async function PropertySearchPage() {
  const contact = getContactLinks(await fetchSiteSettings());
  return (
    <>
      <PageIntro
        eyebrow="Listings"
        title="Property search"
        lead="Search every home for sale across Greensboro, High Point, Winston-Salem, and the Triad."
      />
      <Section labelledBy="search-coming-heading">
        <EmptyState
          icon={Search}
          titleId="search-coming-heading"
          title="Home search is on the way"
          description="We're adding a full Triad MLS search here. Until then, call or text us and we'll send homes that match what you want."
          action={
            <ButtonLink href={contact?.callHref ?? CONTACT_PAGE_PATH} size="m" variant="main">
              <Phone aria-hidden size={ICON_SIZE.button} />
              {contact ? "Call CWR" : "Contact us"}
            </ButtonLink>
          }
        />
        <div className="mt-6 text-center">
          <TextLink href="/listings" hasArrow>See our featured properties</TextLink>
        </div>
      </Section>
    </>
  );
}

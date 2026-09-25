import { House, Phone } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ListingCard } from "@/components/content/listing-card";
import { Pagination } from "@/components/content/pagination";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageIntro } from "@/components/ui/page-intro";
import { Section } from "@/components/ui/section";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { LISTINGS_PAGE_SIZE, fetchListingsPage } from "@/lib/content/listings";
import { getPageNumber, getTotalPages } from "@/lib/content/page-number";
import { CONTACT_PAGE_PATH, getContactLinks } from "@/lib/site/contact-links";
import { fetchSiteSettings } from "@/lib/site/site-settings";

export const metadata: Metadata = {
  title: "Featured properties",
  description: "Homes and commercial properties listed by Charlie Ward Realty in Greensboro and the Triad.",
  alternates: { canonical: "/listings" },
};

type ListingsPageProps = { searchParams: Promise<{ page?: string | string[] }> };

async function NoListings() {
  const contact = getContactLinks(await fetchSiteSettings());
  return (
    <EmptyState
      icon={House}
      titleId="listings-heading"
      title="No featured listings right now"
      description="New homes appear here as soon as they go live. Call or text us to hear about homes before they're listed."
      action={
        <ButtonLink href={contact?.callHref ?? CONTACT_PAGE_PATH} size="m" variant="main">
          <Phone aria-hidden size={ICON_SIZE.button} />
          {contact ? "Call CWR" : "Contact us"}
        </ButtonLink>
      }
    />
  );
}

export default async function ListingsPage({ searchParams }: ListingsPageProps) {
  const page = getPageNumber((await searchParams).page);
  if (page === null) notFound();
  const { listings, totalCount } = await fetchListingsPage(page);
  const totalPages = getTotalPages(totalCount, LISTINGS_PAGE_SIZE);
  if (page > totalPages) notFound();
  return (
    <>
      <PageIntro
        eyebrow="Listings"
        title="Featured properties"
        lead="Homes and commercial properties we're proud to represent across Greensboro and the Triad."
      />
      <Section labelledBy="listings-heading">
        {listings.length === 0 ? (
          <NoListings />
        ) : (
          <>
            <h2 id="listings-heading" className="sr-only">Listings</h2>
            <ul className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {listings.map((listing, index) => (
                <li key={listing.slug}>
                  <ListingCard listing={listing} isPriority={index === 0} />
                </li>
              ))}
            </ul>
            <Pagination basePath="/listings" currentPage={page} totalPages={totalPages} />
          </>
        )}
      </Section>
    </>
  );
}

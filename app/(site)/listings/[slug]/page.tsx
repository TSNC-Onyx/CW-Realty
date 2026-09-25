import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ListingDetail } from "@/components/content/listing-detail";
import { fetchListingBySlug } from "@/lib/content/listings";
import { getPhotoSources } from "@/lib/content/media";
import { getContactLinks } from "@/lib/site/contact-links";
import { fetchSiteSettings } from "@/lib/site/site-settings";

const META_DESCRIPTION_LENGTH = 155;

type ListingPageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: ListingPageProps): Promise<Metadata> {
  const { slug } = await params;
  const listing = await fetchListingBySlug(slug);
  if (!listing) return { title: "Listing not found" };
  const firstPhoto = listing.photos[0];
  const imageUrl = firstPhoto ? getPhotoSources({ folder: firstPhoto.folder, originalWidth: firstPhoto.width })?.fallbackSrc : undefined;
  return {
    title: `${listing.streetAddress}, ${listing.cityLine}`,
    description: listing.description.slice(0, META_DESCRIPTION_LENGTH),
    alternates: { canonical: `/listings/${listing.slug}` },
    openGraph: imageUrl ? { images: [{ url: imageUrl, alt: firstPhoto?.alt }] } : undefined,
  };
}

export default async function ListingPage({ params }: ListingPageProps) {
  const { slug } = await params;
  const listing = await fetchListingBySlug(slug);
  if (!listing) notFound();
  const contact = getContactLinks(await fetchSiteSettings());
  return <ListingDetail listing={listing} contact={contact} />;
}

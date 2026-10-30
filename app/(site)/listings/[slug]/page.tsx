import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { ListingDetail } from "@/components/content/listing-detail";
import { fetchListingBySlug } from "@/lib/content/listings";
import { getPhotoSources } from "@/lib/content/media";
import { getContactLinks } from "@/lib/site/contact-links";
import { getShareMetadata } from "@/lib/site/share-image";
import { fetchSiteSettings } from "@/lib/site/site-settings";

const META_DESCRIPTION_LENGTH = 155;

type ListingPageProps = { params: Promise<{ slug: string }> };

type ShareImage = { url: string; alt?: string };

// Next.js merges metadata one level deep, so a listing's own openGraph/twitter would drop the
// site name, type and large card set in app/layout.tsx; they are copied in and only the image changes.
async function getListingShareMetadata(image: ShareImage): Promise<Pick<Metadata, "openGraph" | "twitter">> {
  const { openGraph, twitter } = getShareMetadata((await headers()).get("host"));
  return { openGraph: { ...openGraph, images: [image] }, twitter: { ...twitter, images: [image] } };
}

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
    // Without a photo the site's share image from app/layout.tsx stays.
    ...(imageUrl ? await getListingShareMetadata({ url: imageUrl, alt: firstPhoto?.alt }) : {}),
  };
}

export default async function ListingPage({ params }: ListingPageProps) {
  const { slug } = await params;
  const listing = await fetchListingBySlug(slug);
  if (!listing) notFound();
  const contact = getContactLinks(await fetchSiteSettings());
  return <ListingDetail listing={listing} contact={contact} />;
}

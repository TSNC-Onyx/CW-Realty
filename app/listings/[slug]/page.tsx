import { MessageSquare, Phone } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ListingFacts } from "@/components/content/listing-facts";
import { ResponsivePhoto } from "@/components/content/responsive-photo";
import { StatusTag } from "@/components/content/status-tag";
import { ButtonLink } from "@/components/ui/button-link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Prose } from "@/components/ui/prose";
import { Container, Section } from "@/components/ui/section";
import { TextLink } from "@/components/ui/text-link";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { getDisplayPrice, getParagraphs } from "@/lib/content/format";
import { fetchListingBySlug, type Listing } from "@/lib/content/listings";
import { getPhotoSources } from "@/lib/content/media";
import { CONTACT_PAGE_PATH, getContactLinks, type ContactLinks } from "@/lib/site/contact-links";
import { fetchSiteSettings } from "@/lib/site/site-settings";

const MAIN_PHOTO_SIZES = "(min-width: 1312px) 860px, (min-width: 1024px) 66vw, 100vw";
const EXTRA_PHOTO_SIZES = "(min-width: 1024px) 420px, 50vw";
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

function ListingGallery({ listing }: { listing: Listing }) {
  const [mainPhoto, ...extraPhotos] = listing.photos;
  return (
    <div>
      <div className="relative">
        <StatusTag status={listing.status} isOverlay />
        <ResponsivePhoto photo={mainPhoto ?? null} ratio="photo" sizes={MAIN_PHOTO_SIZES} isPriority />
      </div>
      {extraPhotos.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-4">
          {extraPhotos.map((photo) => (
            <li key={photo.folder}>
              <ResponsivePhoto photo={photo} ratio="photo" sizes={EXTRA_PHOTO_SIZES} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ListingContactPanel({ listing, contact }: { listing: Listing; contact: ContactLinks | null }) {
  const heading = listing.status === "sold" ? "This property has sold" : "Interested in this property?";
  const body =
    listing.status === "sold"
      ? "Looking for something similar? Tell us what you want and we'll keep an eye out."
      : "Schedule a showing or ask a question. We answer the phone.";
  return (
    <div className="mt-8 border-t-2 border-ink bg-surface-soft p-6">
      <h2 className="type-h3">{heading}</h2>
      <p className="mt-2 mb-6">{body}</p>
      <div className="grid gap-3">
        <ButtonLink href={contact?.callHref ?? CONTACT_PAGE_PATH} size="l" variant="main">
          <Phone aria-hidden size={ICON_SIZE.button} />
          {contact ? `Call ${contact.displayPhone}` : "Contact us"}
        </ButtonLink>
        {contact && (
          <ButtonLink href={contact.textHref} size="l" variant="secondary">
            <MessageSquare aria-hidden size={ICON_SIZE.button} />
            Text us
          </ButtonLink>
        )}
      </div>
    </div>
  );
}

export default async function ListingPage({ params }: ListingPageProps) {
  const { slug } = await params;
  const listing = await fetchListingBySlug(slug);
  if (!listing) notFound();
  const contact = getContactLinks(await fetchSiteSettings());
  return (
    <>
      <div className="bg-page pt-12 lg:pt-24">
        <Container className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <ListingGallery listing={listing} />
          </div>
          <div className="lg:col-span-4">
            <Eyebrow>Featured property</Eyebrow>
            <h1 className="type-h1">{listing.streetAddress}</h1>
            <p className="type-lead mt-2 text-muted">{listing.cityLine}</p>
            <p className="type-price mt-4 mb-3">{getDisplayPrice(listing.priceCents)}</p>
            <ListingFacts bedrooms={listing.bedrooms} bathrooms={listing.bathrooms} squareFeet={listing.squareFeet} />
            <ListingContactPanel listing={listing} contact={contact} />
          </div>
        </Container>
      </div>
      <Section labelledBy="about-listing-heading">
        <Prose>
          <h2 id="about-listing-heading">About this property</h2>
          {getParagraphs(listing.description).map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </Prose>
        <div className="mt-8">
          <TextLink href="/listings" hasArrow>See all featured properties</TextLink>
        </div>
      </Section>
    </>
  );
}

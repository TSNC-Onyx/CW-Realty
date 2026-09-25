import { MessageSquare, Phone } from "lucide-react";

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
import type { Listing } from "@/lib/content/listings";
import { CONTACT_PAGE_PATH, type ContactLinks } from "@/lib/site/contact-links";

// The listing page layout, shared by the public page and the admin preview (Admin §1).

const MAIN_PHOTO_SIZES = "(min-width: 1312px) 860px, (min-width: 1024px) 66vw, 100vw";
const EXTRA_PHOTO_SIZES = "(min-width: 1024px) 420px, 50vw";

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

export function ListingDetail({ listing, contact }: { listing: Listing; contact: ContactLinks | null }) {
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

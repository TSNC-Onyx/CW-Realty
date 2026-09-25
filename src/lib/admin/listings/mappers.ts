import type { AdminListing } from "@/lib/admin/listings/queries";
import type { Listing } from "@/lib/content/listings";

// Shapes an editor's listing row for the form and for the public-page preview.

export type ListingDefaults = {
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;
  price: string;
  bedrooms: string;
  bathrooms: string;
  squareFeet: string;
  description: string;
  slug: string;
};

const WHOLE_DOLLARS = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const CENTS_PER_DOLLAR = 100;

export function getListingDefaults(listing: AdminListing): ListingDefaults {
  return {
    streetAddress: listing.street_address,
    city: listing.city,
    state: listing.state,
    postalCode: listing.postal_code,
    price: WHOLE_DOLLARS.format(listing.price_cents / CENTS_PER_DOLLAR),
    bedrooms: listing.bedrooms?.toString() ?? "",
    bathrooms: listing.bathrooms?.toString() ?? "",
    squareFeet: listing.square_feet?.toString() ?? "",
    description: listing.description,
    slug: listing.slug,
  };
}

export function getPreviewListing(listing: AdminListing): Listing {
  return {
    slug: listing.slug,
    streetAddress: listing.street_address,
    cityLine: `${listing.city}, ${listing.state} ${listing.postal_code}`,
    priceCents: listing.price_cents,
    status: listing.status,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    squareFeet: listing.square_feet,
    description: listing.description,
    photos: listing.listing_photos.map((photo) => ({ folder: photo.storage_path, alt: photo.alt_text, width: photo.width, height: photo.height })),
  };
}

export function getDisplayCityLine(listing: AdminListing): string {
  return `${listing.city}, ${listing.state} ${listing.postal_code}`;
}

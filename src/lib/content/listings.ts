import { cache } from "react";
import { z } from "zod";

import { CWR_TENANT_SLUG, SupabaseQueryError, getPublicClient } from "@/lib/supabase/public-client";

// Live featured properties. Row Level Security returns only live, non-deleted listings
// and their non-deleted photos to visitors. Order: active, pending, sold, then sort order.

export const LISTINGS_PAGE_SIZE = 12;
const MAX_SITEMAP_LISTINGS = 1000;
// PostgREST answers a page past the end of the list with this error code.
const RANGE_NOT_SATISFIABLE = "PGRST103";

const LISTING_COLUMNS =
  "slug, street_address, city, state, postal_code, price_cents, status, bedrooms, bathrooms, square_feet, description, listing_photos(storage_path, alt_text, width, height, sort_order), tenants!inner(slug)";

const photoRowSchema = z.object({
  storage_path: z.string(),
  alt_text: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sort_order: z.number().int(),
});

const listingRowSchema = z.object({
  slug: z.string(),
  street_address: z.string(),
  city: z.string(),
  state: z.string(),
  postal_code: z.string(),
  price_cents: z.number().int().positive(),
  status: z.enum(["active", "pending", "sold"]),
  bedrooms: z.number().int().nullable(),
  bathrooms: z.coerce.number().nullable(),
  square_feet: z.number().int().nullable(),
  description: z.string(),
  listing_photos: z.array(photoRowSchema),
});

type ListingRow = z.infer<typeof listingRowSchema>;

export type ListingStatus = ListingRow["status"];

export type ListingPhoto = { folder: string; alt: string; width: number; height: number };

export type Listing = {
  slug: string;
  streetAddress: string;
  cityLine: string;
  priceCents: number;
  status: ListingStatus;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFeet: number | null;
  description: string;
  photos: ListingPhoto[];
};

export type ListingsPage = { listings: Listing[]; totalCount: number };

function getListingFromRow(row: ListingRow): Listing {
  const photos = [...row.listing_photos]
    .sort((first, second) => first.sort_order - second.sort_order)
    .map((photo) => ({ folder: photo.storage_path, alt: photo.alt_text, width: photo.width, height: photo.height }));
  return {
    slug: row.slug,
    streetAddress: row.street_address,
    cityLine: `${row.city}, ${row.state} ${row.postal_code}`,
    priceCents: row.price_cents,
    status: row.status,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    squareFeet: row.square_feet,
    description: row.description,
    photos,
  };
}

function getListingsQuery() {
  const client = getPublicClient();
  if (!client) return null;
  return client
    .from("listings")
    .select(LISTING_COLUMNS, { count: "exact" })
    .eq("tenants.slug", CWR_TENANT_SLUG);
}

/**
 * One page (1-based) of live listings; a page past the end comes back empty.
 * Throws SupabaseQueryError when the database fails.
 */
export async function fetchListingsPage(page: number, pageSize = LISTINGS_PAGE_SIZE): Promise<ListingsPage> {
  const query = getListingsQuery();
  if (!query) return { listings: [], totalCount: 0 };
  const from = (page - 1) * pageSize;
  const { data: rows, error, count } = await query
    .order("status")
    .order("sort_order")
    .order("slug")
    .range(from, from + pageSize - 1);
  if (error?.code === RANGE_NOT_SATISFIABLE) return { listings: [], totalCount: 0 };
  if (error) throw new SupabaseQueryError(error.message, { operation: "fetchListingsPage", cause: error });
  return { listings: z.array(listingRowSchema).parse(rows).map(getListingFromRow), totalCount: count ?? 0 };
}

export const fetchListingBySlug = cache(async (slug: string): Promise<Listing | null> => {
  const query = getListingsQuery();
  if (!query) return null;
  const { data: row, error } = await query.eq("slug", slug).maybeSingle();
  if (error) throw new SupabaseQueryError(error.message, { operation: "fetchListingBySlug", cause: error });
  return row ? getListingFromRow(listingRowSchema.parse(row)) : null;
});

export async function fetchListingSlugs(): Promise<string[]> {
  const { listings } = await fetchListingsPage(1, MAX_SITEMAP_LISTINGS);
  return listings.map((listing) => listing.slug);
}

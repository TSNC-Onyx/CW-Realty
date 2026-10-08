import "server-only";

import { getLoaded, getLoadFailure, type LoadResult } from "@/lib/admin/load-result";
import type { AdminContext } from "@/lib/admin/require-admin";
import type { ListingStatus } from "@/lib/content/listing-statuses";

// Editors' view of listings: drafts included; trash excluded. A failed query is a load
// failure, never an empty list or a missing listing.

const MAX_LISTING_ROWS = 500;

export type AdminListingPhoto = { id: string; storage_path: string; alt_text: string; width: number; height: number; sort_order: number };

export type AdminListing = {
  id: string;
  slug: string;
  street_address: string;
  city: string;
  state: string;
  postal_code: string;
  price_cents: number;
  status: ListingStatus;
  publish_state: "draft" | "live";
  bedrooms: number | null;
  bathrooms: number | null;
  square_feet: number | null;
  description: string;
  listing_photos: AdminListingPhoto[];
};

const LISTING_COLUMNS =
  "id, slug, street_address, city, state, postal_code, price_cents, status, publish_state, bedrooms, bathrooms, square_feet, description, listing_photos(id, storage_path, alt_text, width, height, sort_order, deleted_at)";

type AdminListingRow = Omit<AdminListing, "listing_photos"> & { listing_photos: (AdminListingPhoto & { deleted_at: string | null })[] };

function getListingFromRow(row: AdminListingRow): AdminListing {
  const photos = row.listing_photos
    .filter((photo) => photo.deleted_at === null)
    .sort((first, second) => first.sort_order - second.sort_order || first.id.localeCompare(second.id));
  return { ...row, bathrooms: row.bathrooms === null ? null : Number(row.bathrooms), listing_photos: photos };
}

export async function fetchAdminListings({ supabase, tenantId }: AdminContext): Promise<LoadResult<AdminListing[]>> {
  const { data, error } = await supabase
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("sort_order")
    .order("slug")
    .limit(MAX_LISTING_ROWS)
    .returns<AdminListingRow[]>();
  if (error) return getLoadFailure("listings", error);
  return getLoaded((data ?? []).map(getListingFromRow));
}

/** Loaded null: the listing is missing or in the trash. */
export async function fetchAdminListing({ supabase, tenantId }: AdminContext, id: string): Promise<LoadResult<AdminListing | null>> {
  const { data, error } = await supabase.from("listings").select(LISTING_COLUMNS).eq("tenant_id", tenantId).eq("id", id).is("deleted_at", null).maybeSingle<AdminListingRow>();
  if (error) return getLoadFailure("listing", error);
  return getLoaded(data ? getListingFromRow(data) : null);
}

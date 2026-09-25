import { House, Plus } from "lucide-react";
import type { Metadata } from "next";

import { ListingList } from "@/components/admin/listings/listing-list";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { TextLink } from "@/components/ui/text-link";
import { getDisplayCityLine } from "@/lib/admin/listings/mappers";
import { fetchAdminListings } from "@/lib/admin/listings/queries";
import { EDITOR_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { getDisplayPrice } from "@/lib/content/format";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

export const metadata: Metadata = { title: "Listings" };

export default async function AdminListingsPage() {
  const admin = await requireAdminPage(EDITOR_ROLES);
  const listings = await fetchAdminListings(admin);
  return (
    <>
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="type-h1 mb-2">Listings</h1>
          <p className="type-lead text-muted">On the website, active homes come first, then pending, then sold — each in this order.</p>
          <TextLink href="/listings" hasArrow>View featured properties</TextLink>
        </div>
        <ButtonLink href="/admin/listings/new" size="m" variant="main">
          <Plus aria-hidden size={ICON_SIZE.button} />
          Add listing
        </ButtonLink>
      </div>
      {listings.length === 0 ? (
        <EmptyState
          icon={House}
          titleId="listings-empty"
          title="No listings yet"
          description="Add a property, give it photos, then publish it to the website."
          action={<ButtonLink href="/admin/listings/new" size="m" variant="main">Add listing</ButtonLink>}
        />
      ) : (
        <ListingList
          listings={listings.map((listing) => ({
            id: listing.id,
            streetAddress: listing.street_address,
            cityLine: getDisplayCityLine(listing),
            price: getDisplayPrice(listing.price_cents),
            status: listing.status,
            publishState: listing.publish_state,
            photoCount: listing.listing_photos.length,
          }))}
        />
      )}
    </>
  );
}

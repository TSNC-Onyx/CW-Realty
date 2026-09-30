import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ListingForm } from "@/components/admin/listings/listing-form";
import { ListingPhotos } from "@/components/admin/listings/listing-photos";
import { ListingPublishing } from "@/components/admin/listings/listing-publishing";
import { LoadProblem } from "@/components/admin/load-problem";
import { Message } from "@/components/ui/message";
import { TextLink } from "@/components/ui/text-link";
import { getListingDefaults } from "@/lib/admin/listings/mappers";
import { fetchAdminListing } from "@/lib/admin/listings/queries";
import { reportPageLoad, type LoadProblemNotice } from "@/lib/admin/report-page-load";
import { EDITOR_ROLES, requireAdminPage } from "@/lib/admin/require-admin";

export const metadata: Metadata = { title: "Edit listing" };

type EditListingPageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> };

function ListingLoadProblem({ notice }: { notice: LoadProblemNotice | null }) {
  return (
    <>
      <TextLink href="/admin/listings">Back to listings</TextLink>
      <h1 className="type-h1 mt-4 mb-8">Edit listing</h1>
      <LoadProblem notice={notice} />
    </>
  );
}

export default async function EditListingPage({ params, searchParams }: EditListingPageProps) {
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  const admin = await requireAdminPage(EDITOR_ROLES);
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) notFound();
  const listingLoad = await fetchAdminListing(admin, parsedId.data);
  const notice = await reportPageLoad({ admin, action: "listings.load", results: [listingLoad] });
  if (!listingLoad.isLoaded) return <ListingLoadProblem notice={notice} />;
  const listing = listingLoad.data;
  if (!listing) notFound();
  return (
    <>
      <TextLink href="/admin/listings">Back to listings</TextLink>
      <h1 className="type-h1 mt-4 mb-8">{listing.street_address}</h1>
      {created && (
        <div className="mb-8 max-w-prose">
          <Message tone="success" title="Listing saved as a draft">
            <p>Add photos below, preview it, then publish it to the website.</p>
          </Message>
        </div>
      )}
      <section aria-labelledby="publishing-heading" className="mb-12 border-t-2 border-ink pt-6">
        <h2 id="publishing-heading" className="type-h3 mb-4">Status and publishing</h2>
        <ListingPublishing listingId={listing.id} status={listing.status} publishState={listing.publish_state} photoCount={listing.listing_photos.length} />
      </section>
      <section aria-labelledby="photos-heading" className="mb-12 border-t-2 border-ink pt-6">
        <h2 id="photos-heading" className="type-h3 mb-4">Photos</h2>
        <ListingPhotos
          listingId={listing.id}
          photos={listing.listing_photos.map((photo) => ({ id: photo.id, folder: photo.storage_path, alt: photo.alt_text, width: photo.width, height: photo.height }))}
        />
      </section>
      <ListingForm mode="edit" listingId={listing.id} defaults={getListingDefaults(listing)} />
    </>
  );
}

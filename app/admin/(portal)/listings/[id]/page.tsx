import type { Metadata } from "next";
import { z } from "zod";

import { ListingForm } from "@/components/admin/listings/listing-form";
import { ListingPhotos } from "@/components/admin/listings/listing-photos";
import { ListingPublishing } from "@/components/admin/listings/listing-publishing";
import { LoadProblem } from "@/components/admin/load-problem";
import { CreatedMessage } from "@/components/admin/uploads/created-message";
import { TextLink } from "@/components/ui/text-link";
import { getMissedCount } from "@/lib/admin/created-href";
import { getListingDefaults } from "@/lib/admin/listings/mappers";
import { fetchAdminListing } from "@/lib/admin/listings/queries";
import { showPageNotFound } from "@/lib/admin/record-page-not-found";
import { reportPageLoad, type LoadProblemNotice } from "@/lib/admin/report-page-load";
import { EDITOR_ROLES, requireAdminPage } from "@/lib/admin/require-admin";

export const metadata: Metadata = { title: "Edit listing" };

type EditListingPageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; missed?: string }> };

function ListingLoadProblem({ notice }: { notice: LoadProblemNotice | null }) {
  return (
    <>
      <TextLink href="/admin/listings">Back to listings</TextLink>
      <h1 className="type-h1 mt-4 mb-8">Edit listing</h1>
      <LoadProblem notice={notice} />
    </>
  );
}

function getNextStep(photoCount: number): string {
  return photoCount > 0 ? "Preview it, then publish it to the website." : "Add photos below, preview it, then publish it to the website.";
}

export default async function EditListingPage({ params, searchParams }: EditListingPageProps) {
  const [{ id }, { created, missed }] = await Promise.all([params, searchParams]);
  const admin = await requireAdminPage(EDITOR_ROLES);
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return showPageNotFound({ admin, path: `/admin/listings/${id}` });
  const listingLoad = await fetchAdminListing(admin, parsedId.data);
  const notice = await reportPageLoad({ admin, action: "listings.load", results: [listingLoad] });
  if (!listingLoad.isLoaded) return <ListingLoadProblem notice={notice} />;
  const listing = listingLoad.data;
  if (!listing) return showPageNotFound({ admin, path: `/admin/listings/${id}` });
  return (
    <>
      <TextLink href="/admin/listings">Back to listings</TextLink>
      <h1 className="type-h1 mt-4 mb-8">{listing.street_address}</h1>
      {created && <CreatedMessage title="Listing saved as a draft" nextStep={getNextStep(listing.listing_photos.length)} missedCount={getMissedCount(missed)} fileNoun="photo" />}
      <section aria-labelledby="publishing-heading" className="mb-12">
        <h2 id="publishing-heading" className="sr-only">Status and publishing</h2>
        <ListingPublishing listingId={listing.id} status={listing.status} publishState={listing.publish_state} photoCount={listing.listing_photos.length} />
      </section>
      <section aria-labelledby="photos-heading" className="mb-12 border-t-2 border-ink pt-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="photos-heading" className="type-h3">
            Photos<span className="ml-2 text-base font-regular text-muted">{listing.listing_photos.length}</span>
          </h2>
          <p className="type-small text-muted">The first photo is the main one. Drag a photo or use its arrows to change the order.</p>
        </div>
        <ListingPhotos
          listingId={listing.id}
          photos={listing.listing_photos.map((photo) => ({ id: photo.id, folder: photo.storage_path, alt: photo.alt_text, width: photo.width, height: photo.height }))}
        />
      </section>
      <ListingForm listingId={listing.id} defaults={getListingDefaults(listing)} />
    </>
  );
}

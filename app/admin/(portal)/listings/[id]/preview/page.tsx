import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { LoadProblem } from "@/components/admin/load-problem";
import { ListingDetail } from "@/components/content/listing-detail";
import { Message } from "@/components/ui/message";
import { TextLink } from "@/components/ui/text-link";
import { getPreviewListing } from "@/lib/admin/listings/mappers";
import { fetchAdminListing } from "@/lib/admin/listings/queries";
import { reportPageLoad, type LoadProblemNotice } from "@/lib/admin/report-page-load";
import { EDITOR_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { getContactLinks } from "@/lib/site/contact-links";
import { fetchSiteSettingsLoad } from "@/lib/site/site-settings";

export const metadata: Metadata = { title: "Preview listing" };

function PreviewLoadProblem({ notice }: { notice: LoadProblemNotice | null }) {
  return (
    <>
      <TextLink href="/admin/listings">Back to listings</TextLink>
      <h1 className="type-h1 mt-4 mb-8">Preview listing</h1>
      <LoadProblem notice={notice} />
    </>
  );
}

// Admin §1 "preview before publish": the public page layout, drafts included.
export default async function ListingPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requireAdminPage(EDITOR_ROLES);
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) notFound();
  const [listingLoad, settingsLoad] = await Promise.all([fetchAdminListing(admin, parsedId.data), fetchSiteSettingsLoad()]);
  const notice = await reportPageLoad({ admin, action: "listings.load", results: [listingLoad, settingsLoad] });
  if (!listingLoad.isLoaded) return <PreviewLoadProblem notice={notice} />;
  const listing = listingLoad.data;
  if (!listing) notFound();
  const isLive = listing.publish_state === "live";
  return (
    <>
      <div className="mb-6 grid gap-4">
        <TextLink href={`/admin/listings/${listing.id}`}>Back to editing</TextLink>
        <Message tone="info" title={isLive ? "Preview — this listing is on the website" : "Preview — visitors can't see this draft yet"}>
          <p>This is how the listing page looks with the saved details.</p>
        </Message>
        {!settingsLoad.isLoaded && <LoadProblem notice={notice} title="The office contact details didn't load" />}
      </div>
      <div className="-mx-4 border-y border-line md:-mx-8">
        <ListingDetail listing={getPreviewListing(listing)} contact={getContactLinks(settingsLoad.isLoaded ? settingsLoad.data : null)} />
      </div>
    </>
  );
}

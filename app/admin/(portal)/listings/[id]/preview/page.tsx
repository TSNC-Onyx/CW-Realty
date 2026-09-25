import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ListingDetail } from "@/components/content/listing-detail";
import { Message } from "@/components/ui/message";
import { TextLink } from "@/components/ui/text-link";
import { getPreviewListing } from "@/lib/admin/listings/mappers";
import { fetchAdminListing } from "@/lib/admin/listings/queries";
import { EDITOR_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { getContactLinks } from "@/lib/site/contact-links";
import { fetchSiteSettings } from "@/lib/site/site-settings";

export const metadata: Metadata = { title: "Preview listing" };

// Admin §1 "preview before publish": the public page layout, drafts included.
export default async function ListingPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requireAdminPage(EDITOR_ROLES);
  const parsedId = z.uuid().safeParse(id);
  const listing = parsedId.success ? await fetchAdminListing(admin, parsedId.data) : null;
  if (!listing) notFound();
  const isLive = listing.publish_state === "live";
  return (
    <>
      <div className="mb-6 grid gap-4">
        <TextLink href={`/admin/listings/${listing.id}`}>Back to editing</TextLink>
        <Message tone="info" title={isLive ? "Preview — this listing is on the website" : "Preview — visitors can't see this draft yet"}>
          <p>This is how the listing page looks with the saved details.</p>
        </Message>
      </div>
      <div className="-mx-4 border-y border-line md:-mx-8">
        <ListingDetail listing={getPreviewListing(listing)} contact={getContactLinks(await fetchSiteSettings())} />
      </div>
    </>
  );
}

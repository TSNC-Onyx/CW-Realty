import type { Metadata } from "next";

import { NewListingForm } from "@/components/admin/listings/new-listing-form";
import { TextLink } from "@/components/ui/text-link";
import { EDITOR_ROLES, requireAdminPage } from "@/lib/admin/require-admin";

export const metadata: Metadata = { title: "Add listing" };

const EMPTY_LISTING = { streetAddress: "", city: "", state: "NC", postalCode: "", price: "", bedrooms: "", bathrooms: "", squareFeet: "", description: "", slug: "" };

export default async function NewListingPage() {
  await requireAdminPage(EDITOR_ROLES);
  return (
    <>
      <TextLink href="/admin/listings">Back to listings</TextLink>
      <h1 className="type-h1 mt-4 mb-2">Add listing</h1>
      <p className="type-lead mb-10 text-muted">Add the details and photos. It saves as a draft, so you can preview it before publishing.</p>
      <NewListingForm idempotencyKey={crypto.randomUUID()} defaults={EMPTY_LISTING} />
    </>
  );
}

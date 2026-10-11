"use client";

import { Fragment } from "react";

import { ListingFields } from "@/components/admin/listings/listing-fields";
import { SaveBar } from "@/components/admin/save-bar";
import { SavedStateProvider } from "@/components/admin/saved-state";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { updateListingAction } from "@/lib/admin/listings/actions";
import type { ListingDefaults } from "@/lib/admin/listings/mappers";

// Edit a listing's details. Adding a listing is NewListingForm (details and photos together).
export function ListingForm({ listingId, defaults }: { listingId: string; defaults: ListingDefaults }) {
  const { state, isPending, isDirty, savedVersion, formRef, handleSubmit, handleInput } = useAdminForm(updateListingAction, { problemAction: "listings.update" });
  return (
    <SavedStateProvider isNewItem={false}>
      <form ref={formRef} onSubmit={handleSubmit} onInput={handleInput} noValidate className="grid gap-12">
        {/* Restarts the fields from the stored values after each save; the Save bar keeps focus. */}
        <Fragment key={savedVersion}>
          <input type="hidden" name="listingId" value={listingId} />
          <ListingFields defaults={defaults} errors={state.fieldErrors} isNewListing={false} />
        </Fragment>
        <SaveBar isPending={isPending} isDirty={isDirty} label="Save changes" />
      </form>
    </SavedStateProvider>
  );
}

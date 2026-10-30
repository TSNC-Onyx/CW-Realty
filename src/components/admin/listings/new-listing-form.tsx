"use client";

import { ImagePlus } from "lucide-react";
import type { FormEvent } from "react";

import { AdminTwoColumn } from "@/components/admin/admin-two-column";
import { ListingFields } from "@/components/admin/listings/listing-fields";
import { fetchMissedListingPhotos } from "@/components/admin/listings/upload-listing-photos";
import { SaveBar } from "@/components/admin/save-bar";
import { SavedStateProvider } from "@/components/admin/saved-state";
import { useToast } from "@/components/admin/toast-provider";
import { FileDropZone } from "@/components/admin/uploads/file-drop-zone";
import { PendingPhotoList } from "@/components/admin/uploads/pending-photo-list";
import { handleGuardedSubmit, useCreateWithUploads, type UploadToRecord } from "@/components/admin/uploads/use-create-with-uploads";
import { usePendingPhotos, type PendingPhotos } from "@/components/admin/uploads/use-pending-photos";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { useIdempotencyKey } from "@/components/admin/use-idempotency-key";
import { createListingAction } from "@/lib/admin/listings/actions";
import type { ListingDefaults } from "@/lib/admin/listings/mappers";

// Add listing (owner choice 2026-10-10, docs/admin-upload-layout-plan.md): details on the
// left, photos on the right; "Save as draft" saves the listing, uploads the photos in the
// order shown, then opens the listing.

const LISTINGS_ADMIN_PATH = "/admin/listings";

function NewListingPhotos({ pending, isDisabled }: { pending: PendingPhotos; isDisabled: boolean }) {
  return (
    <div className="grid gap-4 border-t-2 border-ink pt-6">
      <h2 className="type-h3">
        Photos<span className="ml-2 text-base font-regular text-muted">(optional)</span>
      </h2>
      <p className="type-small text-muted">The first photo is the main one, shown on cards and at the top of the page. Drag a photo or use the arrows to change the order.</p>
      <FileDropZone
        icon={ImagePlus}
        title="Drag photos here"
        chooseLabel="Choose photos"
        helperText="You can pick several at once. They're resized for you. A listing needs a photo before it can be published."
        accept="image/*"
        isMultiple
        isDisabled={isDisabled}
        onFiles={pending.addFiles}
      />
      <PendingPhotoList pending={pending} isFirstMain isDisabled={isDisabled} />
    </div>
  );
}

export function NewListingForm({ idempotencyKey: initialKey, defaults }: { idempotencyKey: string; defaults: ListingDefaults }) {
  const pending = usePendingPhotos();
  const { showToast } = useToast();
  const uploadToRecord: UploadToRecord = async ({ recordId, showStatus }) => {
    const missedKeys = await fetchMissedListingPhotos({ listingId: recordId, photos: pending.photos, showStatus, showProblem: ({ title, message }) => showToast({ tone: "error", title, body: message }) });
    return missedKeys.length;
  };
  const { isUploading, uploadStatus, handleCreated } = useCreateWithUploads({ editPath: LISTINGS_ADMIN_PATH, uploadToRecord });
  const { state, isPending, isDirty, formRef, handleSubmit, handleInput } = useAdminForm(createListingAction, { problemAction: "listings.create", onSuccess: (saved) => void handleCreated(saved) });
  const idempotencyKey = useIdempotencyKey(initialKey, state);
  const isBusy = isPending || isUploading;

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) =>
    handleGuardedSubmit(event, { isBusy, showBlocker: pending.firstMissing ? pending.showMissingDescriptions : null, submit: handleSubmit });

  return (
    <SavedStateProvider isNewItem>
      <form ref={formRef} onSubmit={handleFormSubmit} onInput={handleInput} noValidate>
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <AdminTwoColumn sideLabel="Photos" main={<ListingFields defaults={defaults} errors={state.fieldErrors} isNewListing />} side={<NewListingPhotos pending={pending} isDisabled={isBusy} />} />
        <SaveBar isPending={isBusy} isDirty={isDirty} label="Save as draft">
          <p role="status" className="type-small font-semibold">
            {uploadStatus}
          </p>
        </SaveBar>
      </form>
    </SavedStateProvider>
  );
}

"use client";

import { ImagePlus, LoaderCircle, Upload } from "lucide-react";
import { useState } from "react";

import { fetchMissedListingPhotos } from "@/components/admin/listings/upload-listing-photos";
import { useToast } from "@/components/admin/toast-provider";
import { FileDropZone } from "@/components/admin/uploads/file-drop-zone";
import { PendingPhotoList } from "@/components/admin/uploads/pending-photo-list";
import { usePendingPhotos } from "@/components/admin/uploads/use-pending-photos";
import { getButtonClassName } from "@/components/ui/button-link";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Edit listing → add several photos at once: drop or pick them, describe each, then upload
// them in the order shown (docs/admin-upload-layout-plan.md).

function getUploadLabel(count: number): string {
  return count === 1 ? "Upload 1 photo" : `Upload ${count} photos`;
}

function getAddedMessage(count: number): string {
  return count === 1 ? "Photo added." : `${count} photos added.`;
}

export function AddListingPhotos({ listingId, hasPhotos }: { listingId: string; hasPhotos: boolean }) {
  const pending = usePendingPhotos();
  const { showToast } = useToast();
  const [uploadStatus, setUploadStatus] = useState("");
  const isUploading = uploadStatus !== "";
  const count = pending.photos.length;

  const uploadPhotos = async () => {
    const photos = pending.photos;
    const missedKeys = await fetchMissedListingPhotos({ listingId, photos, showStatus: setUploadStatus, showProblem: ({ title, message }) => showToast({ tone: "error", title, body: message }) });
    const uploadedKeys = photos.filter((photo) => !missedKeys.includes(photo.key)).map((photo) => photo.key);
    pending.removePhotos(uploadedKeys);
    setUploadStatus("");
    if (uploadedKeys.length > 0) showToast({ tone: "success", title: getAddedMessage(uploadedKeys.length) });
  };

  const handleUpload = () => {
    if (isUploading) return;
    if (pending.firstMissing) return pending.showMissingDescriptions();
    void uploadPhotos();
  };

  return (
    <section aria-labelledby="add-photos-heading" className="grid gap-4 border-t border-line pt-6">
      <h3 id="add-photos-heading" className="type-h3">
        Add photos
      </h3>
      <div className="grid gap-6 desktop:grid-cols-[var(--container-admin-side)_minmax(0,1fr)] desktop:items-start">
        <FileDropZone
          icon={ImagePlus}
          title="Drag photos here"
          chooseLabel="Choose photos"
          helperText="You can pick several at once. They're resized for you, and added after the photos above."
          accept="image/*"
          isMultiple
          isDisabled={isUploading}
          onFiles={pending.addFiles}
        />
        {count > 0 && (
          <div className="grid gap-4">
            <PendingPhotoList pending={pending} isFirstMain={!hasPhotos} isDisabled={isUploading} photoNoun="new photo" />
            <div className="flex flex-wrap items-center gap-4">
              <button type="button" aria-busy={isUploading} onClick={handleUpload} className={getButtonClassName({ size: "m", variant: "main" })}>
                {isUploading ? <LoaderCircle aria-hidden size={ICON_SIZE.button} className="animate-spin" /> : <Upload aria-hidden size={ICON_SIZE.button} />}
                {isUploading ? "Uploading…" : getUploadLabel(count)}
              </button>
              <p role="status" className="type-small font-semibold">
                {uploadStatus}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

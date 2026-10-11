"use client";

import type { PendingPhoto } from "@/components/admin/uploads/use-pending-photos";
import { fetchPhotoRecordProblem } from "@/components/admin/uploads/upload-photo-record";
import { addListingPhotoAction } from "@/lib/admin/listings/actions";

// Uploads a listing's chosen photos one at a time, in the order shown, so they keep it
// (each is added after the last one). Used by Add listing and by Add photos on the Edit page.

type ListingPhotosUpload = {
  listingId: string;
  photos: PendingPhoto[];
  showStatus: (text: string) => void;
  showProblem: (problem: { title: string; message: string }) => void;
};

/** The keys of the photos that didn't upload; each one's problem was shown through showProblem. */
export async function fetchMissedListingPhotos({ listingId, photos, showStatus, showProblem }: ListingPhotosUpload): Promise<string[]> {
  const missedKeys: string[] = [];
  for (const [index, photo] of photos.entries()) {
    const position = `${index + 1} of ${photos.length}`;
    showStatus(`Uploading photo ${position}…`);
    const problem = await fetchPhotoRecordProblem({
      target: { kind: "listing", recordId: listingId },
      file: photo.file,
      saveProblemAction: "listings.add_photo",
      save: (uploaded) => addListingPhotoAction({ listingId, ...uploaded, alt: photo.alt }),
    });
    if (problem === null) continue;
    missedKeys.push(photo.key);
    showProblem({ title: `Photo ${position} didn't upload`, message: problem });
  }
  return missedKeys;
}

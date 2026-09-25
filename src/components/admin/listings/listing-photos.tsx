"use client";

import { ArrowDown, ArrowUp, Save, Trash2 } from "lucide-react";
import { useId, useRef } from "react";

import { PhotoPicker } from "@/components/admin/photos/photo-picker";
import { QuickActionButton } from "@/components/admin/quick-action-button";
import { ResponsivePhoto } from "@/components/content/responsive-photo";
import { addListingPhotoAction, moveListingPhotoAction, updatePhotoAltAction } from "@/lib/admin/listings/actions";
import { MAX_ALT_TEXT_LENGTH } from "@/lib/admin/photos/photo-files";
import { moveToTrashAction, restoreFromTrashAction } from "@/lib/admin/trash/actions";

export type ListingPhotoItem = { id: string; folder: string; alt: string; width: number; height: number };

type PhotoCardProps = { photo: ListingPhotoItem; position: number; count: number };

function PhotoCard({ photo, position, count }: PhotoCardProps) {
  const altId = useId();
  const altRef = useRef<HTMLTextAreaElement>(null);
  const trashTarget = { table: "listing_photos" as const, id: photo.id };
  const label = `photo ${position}`;
  return (
    <li className="grid gap-3 border-t-2 border-ink pt-3">
      <ResponsivePhoto photo={photo} ratio="photo" sizes="(min-width: 1024px) 400px, 100vw" />
      <p className="type-small text-muted">{position === 1 ? "Main photo — shown on cards and at the top of the page" : `Photo ${position} of ${count}`}</p>
      <div>
        <label htmlFor={altId} className="mb-1 block text-base font-bold">
          Description
        </label>
        <textarea id={altId} ref={altRef} rows={2} maxLength={MAX_ALT_TEXT_LENGTH} defaultValue={photo.alt} className="field-input" />
      </div>
      <div className="flex flex-wrap gap-2">
        <QuickActionButton label="Save description" accessibleLabel={`Save the description of ${label}`} icon={Save} onRun={() => updatePhotoAltAction(photo.id, altRef.current?.value ?? "")} />
        <QuickActionButton label="Up" accessibleLabel={`Move ${label} up`} icon={ArrowUp} isDisabled={position === 1} onRun={() => moveListingPhotoAction(photo.id, "up")} />
        <QuickActionButton label="Down" accessibleLabel={`Move ${label} down`} icon={ArrowDown} isDisabled={position === count} onRun={() => moveListingPhotoAction(photo.id, "down")} />
        <QuickActionButton
          label="Remove"
          accessibleLabel={`Remove ${label}`}
          icon={Trash2}
          onRun={() => moveToTrashAction(trashTarget)}
          undo={{ label: "Undo", onRun: () => restoreFromTrashAction(trashTarget) }}
        />
      </div>
    </li>
  );
}

// Admin §2: photos with required alt text, auto-resized, reorderable.
export function ListingPhotos({ listingId, photos }: { listingId: string; photos: ListingPhotoItem[] }) {
  return (
    <div className="grid gap-8">
      {photos.length > 0 ? (
        <ul className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo, index) => (
            <PhotoCard key={photo.id} photo={photo} position={index + 1} count={photos.length} />
          ))}
        </ul>
      ) : (
        <p>No photos yet. A listing needs at least one photo before it can go on the website.</p>
      )}
      <PhotoPicker
        target={{ kind: "listing", recordId: listingId }}
        buttonLabel="Add photo"
        onUploaded={(uploaded, alt) => addListingPhotoAction({ listingId, ...uploaded, alt })}
      />
    </div>
  );
}

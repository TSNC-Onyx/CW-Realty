"use client";

import { ArrowLeft, ArrowRight, CircleAlert, Trash2 } from "lucide-react";
import { useId, useOptimistic, useState, useTransition } from "react";

import { AddListingPhotos } from "@/components/admin/listings/add-listing-photos";
import { QuickActionButton } from "@/components/admin/quick-action-button";
import { SavedStateLine, useTypedValue } from "@/components/admin/saved-state";
import { useToast } from "@/components/admin/toast-provider";
import { useDragReorder } from "@/components/admin/uploads/use-drag-reorder";
import { ResponsivePhoto } from "@/components/content/responsive-photo";
import { moveListingPhotoAction, moveListingPhotoToAction, updatePhotoAltAction } from "@/lib/admin/listings/actions";
import { getMovedItems } from "@/lib/admin/moved-items";
import { MAX_ALT_TEXT_LENGTH } from "@/lib/admin/photos/photo-files";
import { getSavedState } from "@/lib/admin/saved-state";
import { moveToTrashAction, restoreFromTrashAction } from "@/lib/admin/trash/actions";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { callQuickAction } from "@/lib/observability/call-server-action";

// Admin §2: photos with required alt text, auto-resized, reorderable — as a compact grid
// with drag to reorder and descriptions that save when you leave the box (owner-approved
// prototype 2026-10-10, docs/admin-upload-layout-plan.md).

export type ListingPhotoItem = { id: string; folder: string; alt: string; width: number; height: number };

const MISSING_ALT_MESSAGE = "Describe the photo. The old description is kept until you do.";
const MAIN_PHOTO_SIZES = "(min-width: 1280px) 440px, (min-width: 768px) 66vw, 100vw";
const PHOTO_SIZES = "(min-width: 1280px) 220px, (min-width: 768px) 33vw, 50vw";

type PhotoCardProps = {
  photo: ListingPhotoItem;
  position: number;
  count: number;
  drag: ReturnType<typeof useDragReorder>;
};

function getCardDragClass({ index, drag }: { index: number; drag: PhotoCardProps["drag"] }): string {
  if (drag.draggedIndex === index) return "opacity-40";
  if (drag.targetIndex === index) return "outline-2 outline-offset-2 outline-gold-deep";
  return "";
}

function PhotoDescription({ photo, label }: { photo: ListingPhotoItem; label: string }) {
  const altId = useId();
  const [typedAlt, setTypedAlt] = useTypedValue(photo.alt);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { showToast } = useToast();

  const handleBlur = () => {
    const alt = typedAlt.trim();
    if (alt === photo.alt) return;
    if (!alt) return setError(MISSING_ALT_MESSAGE);
    setError(null);
    startTransition(async () => {
      const result = await callQuickAction("listings.update_photo_alt", () => updatePhotoAltAction(photo.id, alt));
      showToast({ tone: result.status === "success" ? "success" : "error", title: result.message });
    });
  };

  return (
    <div>
      <label htmlFor={altId} className="mb-1 block text-sm font-bold">
        Describe the {label}
      </label>
      <textarea
        id={altId}
        rows={2}
        maxLength={MAX_ALT_TEXT_LENGTH}
        value={typedAlt}
        onChange={(event) => setTypedAlt(event.target.value)}
        onBlur={handleBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${altId}-saved${error ? ` ${altId}-error` : ""}`}
        className="field-input text-sm"
      />
      {error && (
        <p id={`${altId}-error`} className="mt-1 flex items-start gap-2 text-sm leading-normal font-semibold text-error">
          <CircleAlert aria-hidden size={ICON_SIZE.inline} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
      <SavedStateLine id={`${altId}-saved`} state={getSavedState({ current: typedAlt, saved: photo.alt })} />
    </div>
  );
}

function PhotoTools({ photo, position, count, label }: Omit<PhotoCardProps, "drag"> & { label: string }) {
  const trashTarget = { table: "listing_photos" as const, id: photo.id };
  return (
    <div className="absolute top-2 right-2 flex gap-1 bg-surface/90 p-1 transition-opacity pointer-fine:lg:opacity-0 pointer-fine:lg:group-focus-within:opacity-100 pointer-fine:lg:group-hover:opacity-100">
      <QuickActionButton label="Earlier" accessibleLabel={`Move ${label} earlier`} icon={ArrowLeft} isLabelHidden isDisabled={position === 1} problemAction="listings.move_photo" onRun={() => moveListingPhotoAction(photo.id, "up")} />
      <QuickActionButton label="Later" accessibleLabel={`Move ${label} later`} icon={ArrowRight} isLabelHidden isDisabled={position === count} problemAction="listings.move_photo" onRun={() => moveListingPhotoAction(photo.id, "down")} />
      <QuickActionButton
        label="Remove"
        accessibleLabel={`Remove ${label}`}
        icon={Trash2}
        isLabelHidden
        problemAction="trash.move_to_trash"
        onRun={() => moveToTrashAction(trashTarget)}
        undo={{ label: "Undo", problemAction: "trash.restore", onRun: () => restoreFromTrashAction(trashTarget) }}
      />
    </div>
  );
}

function PhotoCard({ photo, position, count, drag }: PhotoCardProps) {
  const index = position - 1;
  const isMain = position === 1;
  const label = isMain ? "main photo" : `photo ${position}`;
  return (
    <li {...drag.getTargetProps(index)} className={`group flex flex-col border border-line bg-surface ${isMain ? "col-span-2 row-span-2" : ""} ${getCardDragClass({ index, drag })}`}>
      <div {...drag.getHandleProps(index)} className="relative cursor-grab" title="Drag to change the order">
        <ResponsivePhoto photo={photo} ratio="photo" sizes={isMain ? MAIN_PHOTO_SIZES : PHOTO_SIZES} />
        <span className={`absolute top-2 left-2 px-2 text-xs font-bold ${isMain ? "bg-gold text-ink" : "bg-ink text-on-dark"}`}>{isMain ? "Main photo" : position}</span>
        <PhotoTools photo={photo} position={position} count={count} label={label} />
      </div>
      <div className="p-3">
        <PhotoDescription photo={photo} label={label} />
      </div>
    </li>
  );
}

export function ListingPhotos({ listingId, photos }: { listingId: string; photos: ListingPhotoItem[] }) {
  const [orderedPhotos, setOrderedPhotos] = useOptimistic(photos);
  const [isMoving, startTransition] = useTransition();
  const { showToast } = useToast();

  const handleDragMove = (move: { from: number; to: number }) => {
    const photo = orderedPhotos[move.from];
    if (!photo) return;
    startTransition(async () => {
      setOrderedPhotos(getMovedItems(orderedPhotos, move));
      const result = await callQuickAction("listings.move_photo", () => moveListingPhotoToAction({ photoId: photo.id, steps: move.to - move.from }));
      showToast({ tone: result.status === "success" ? "success" : "error", title: result.message });
    });
  };
  const drag = useDragReorder({ onMove: handleDragMove, isDisabled: isMoving });

  return (
    <div className="grid gap-10">
      {orderedPhotos.length > 0 ? (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 desktop:grid-cols-5">
          {orderedPhotos.map((photo, index) => (
            <PhotoCard key={photo.id} photo={photo} position={index + 1} count={orderedPhotos.length} drag={drag} />
          ))}
        </ul>
      ) : (
        <p>No photos yet. A listing needs at least one photo before it can go on the website.</p>
      )}
      <AddListingPhotos listingId={listingId} hasPhotos={orderedPhotos.length > 0} />
    </div>
  );
}

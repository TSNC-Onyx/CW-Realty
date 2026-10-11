"use client";

import { ArrowDown, ArrowUp, CircleAlert, X } from "lucide-react";

import { useDragReorder } from "@/components/admin/uploads/use-drag-reorder";
import { getPendingPhotoFieldId, type PendingPhoto, type PendingPhotos } from "@/components/admin/uploads/use-pending-photos";
import { getButtonClassName } from "@/components/ui/button-link";
import { MAX_ALT_TEXT_LENGTH } from "@/lib/admin/photos/photo-files";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// The photos waiting to upload: a small preview, the required description, and controls to
// reorder or remove each one (docs/admin-upload-layout-plan.md).

const PREVIEW_WIDTH = 96;
const PREVIEW_HEIGHT = 64;
const ICON_BUTTON_CLASS = `${getButtonClassName({ size: "s", variant: "secondary" })} px-2`;

type PendingPhotoListProps = {
  pending: PendingPhotos;
  /** Shows "Main photo" on the first one: it becomes the listing's main photo when there is none yet. */
  isFirstMain?: boolean;
  isDisabled?: boolean;
  /** What each photo is called in labels: "photo", or "new photo" beside photos already saved. */
  photoNoun?: string;
};

type PendingPhotoItemProps = {
  photo: PendingPhoto;
  position: number;
  count: number;
  label: string;
  pending: PendingPhotos;
  isDisabled: boolean;
};

function getDragClass({ index, draggedIndex, targetIndex }: { index: number; draggedIndex: number | null; targetIndex: number | null }): string {
  if (draggedIndex === index) return "opacity-40";
  if (targetIndex === index) return "outline-2 outline-gold-deep";
  return "";
}

function getPhotoLabel({ position, count, isMain, photoNoun }: { position: number; count: number; isMain: boolean; photoNoun: string }): string {
  if (isMain) return "main photo";
  return count === 1 ? photoNoun : `${photoNoun} ${position}`;
}

// After Remove, keyboard focus moves to the next photo's description (or the previous one).
function removeAndKeepFocus({ pending, index }: { pending: PendingPhotos; index: number }) {
  const neighbor = pending.photos[index + 1] ?? pending.photos[index - 1] ?? null;
  const removed = pending.photos[index];
  if (!removed) return;
  pending.removePhotos([removed.key]);
  if (neighbor) window.requestAnimationFrame(() => document.getElementById(getPendingPhotoFieldId(neighbor.key))?.focus());
}

function PendingPhotoControls({ position, count, label, pending, isDisabled }: PendingPhotoItemProps) {
  const index = position - 1;
  const isReorderable = count > 1;
  return (
    <div className="flex gap-1">
      {isReorderable && (
        <>
          <button type="button" disabled={isDisabled || index === 0} onClick={() => pending.movePhoto({ from: index, to: index - 1 })} aria-label={`Move ${label} earlier`} className={ICON_BUTTON_CLASS}>
        <ArrowUp aria-hidden size={ICON_SIZE.button} />
      </button>
      <button type="button" disabled={isDisabled || position === count} onClick={() => pending.movePhoto({ from: index, to: index + 1 })} aria-label={`Move ${label} later`} className={ICON_BUTTON_CLASS}>
        <ArrowDown aria-hidden size={ICON_SIZE.button} />
      </button>
        </>
      )}
      <button type="button" disabled={isDisabled} onClick={() => removeAndKeepFocus({ pending, index })} aria-label={`Remove ${label}`} className={ICON_BUTTON_CLASS}>
        <X aria-hidden size={ICON_SIZE.button} />
      </button>
    </div>
  );
}

function PendingPhotoDescription({ photo, label, pending, isDisabled }: Pick<PendingPhotoItemProps, "photo" | "label" | "pending" | "isDisabled">) {
  const fieldId = getPendingPhotoFieldId(photo.key);
  return (
    <div className="min-w-0">
      <label htmlFor={fieldId} className="mb-1 block text-sm font-bold">
        Describe the {label}
      </label>
      <textarea
        id={fieldId}
        rows={2}
        maxLength={MAX_ALT_TEXT_LENGTH}
        value={photo.alt}
        disabled={isDisabled}
        onChange={(event) => pending.setAlt(photo.key, event.target.value)}
        aria-invalid={photo.error ? true : undefined}
        aria-describedby={photo.error ? `${fieldId}-error` : undefined}
        className="field-input text-sm"
      />
      {photo.error && (
        <p id={`${fieldId}-error`} className="mt-1 flex items-start gap-2 text-sm leading-normal font-semibold text-error">
          <CircleAlert aria-hidden size={ICON_SIZE.inline} className="mt-0.5 shrink-0" />
          {photo.error}
        </p>
      )}
    </div>
  );
}

export function PendingPhotoList({ pending, isFirstMain = false, isDisabled = false, photoNoun = "photo" }: PendingPhotoListProps) {
  const { draggedIndex, targetIndex, getHandleProps, getTargetProps } = useDragReorder({ onMove: pending.movePhoto });
  const count = pending.photos.length;
  if (count === 0) return null;
  return (
    <ol aria-label="Photos to upload" className="grid gap-3">
      {pending.photos.map((photo, index) => {
        const position = index + 1;
        const isMain = isFirstMain && index === 0;
        const label = getPhotoLabel({ position, count, isMain, photoNoun });
        const dragClass = getDragClass({ index, draggedIndex, targetIndex });
        return (
          <li key={photo.key} {...getTargetProps(index)} className={`grid grid-cols-[auto_minmax(0,1fr)] gap-3 border border-line bg-surface p-3 ${dragClass}`}>
            <div {...(isDisabled ? {} : getHandleProps(index))} className="relative cursor-grab self-start" title="Drag to change the order">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file */}
              <img src={photo.previewUrl} alt="" width={PREVIEW_WIDTH} height={PREVIEW_HEIGHT} className="aspect-photo w-24 object-cover" />
              {isMain && <span className="absolute top-1 left-1 bg-gold px-1.5 text-xs font-bold text-ink">Main</span>}
            </div>
            <div className="grid min-w-0 gap-2">
              <PendingPhotoDescription photo={photo} label={label} pending={pending} isDisabled={isDisabled} />
              <PendingPhotoControls photo={photo} position={position} count={count} label={label} pending={pending} isDisabled={isDisabled} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

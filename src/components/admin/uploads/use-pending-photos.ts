"use client";

import { useEffect, useRef, useState } from "react";

import { useToast } from "@/components/admin/toast-provider";
import { useUnsavedChanges } from "@/components/admin/use-unsaved-changes";
import { getMovedItems } from "@/lib/admin/moved-items";

// Photos picked but not uploaded yet, each with its own description (alt text is required,
// Admin §2). The local previews are released when a photo leaves the list or the page closes.

export type PendingPhoto = { key: string; file: File; previewUrl: string; alt: string; error: string | null };

const MISSING_ALT_MESSAGE = "Describe the photo, for example “Front of the brick home with a covered porch”";
const MISSING_ALT_TOAST = "Describe each photo before uploading";
const NOT_A_PHOTO_TOAST = "Only photos can be added here";
const NOT_A_PHOTO_BODY = "Choose JPEG, PNG, or WebP pictures.";
const IMAGE_TYPE_PREFIX = "image/";

function isPhotoFile(file: File): boolean {
  return file.type.startsWith(IMAGE_TYPE_PREFIX);
}

function getPendingPhoto(file: File): PendingPhoto {
  return { key: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), alt: "", error: null };
}

export function isMissingDescription(photo: PendingPhoto): boolean {
  return photo.alt.trim() === "";
}

/** The id of a pending photo's description box, to move focus to it. */
export function getPendingPhotoFieldId(key: string): string {
  return `pending-photo-${key}`;
}

function getCheckedPhoto(photo: PendingPhoto): PendingPhoto {
  return { ...photo, error: isMissingDescription(photo) ? MISSING_ALT_MESSAGE : null };
}

export function usePendingPhotos() {
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const photosRef = useRef(photos);
  const { showToast } = useToast();
  const firstMissing = photos.find(isMissingDescription) ?? null;
  useUnsavedChanges(photos.length > 0);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl)), []);

  const showNotAPhoto = () => showToast({ tone: "error", title: NOT_A_PHOTO_TOAST, body: NOT_A_PHOTO_BODY });

  const addFiles = (files: File[]) => {
    const added = files.filter(isPhotoFile).map(getPendingPhoto);
    if (added.length < files.length) showNotAPhoto();
    setPhotos((current) => [...current, ...added]);
  };

  const replaceWithFile = (file: File) => {
    if (!isPhotoFile(file)) return showNotAPhoto();
    photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    setPhotos([getPendingPhoto(file)]);
  };

  const setAlt = (key: string, alt: string) => {
    setPhotos((current) => current.map((photo) => (photo.key === key ? { ...photo, alt, error: null } : photo)));
  };

  const removePhotos = (keys: string[]) => {
    photos.filter((photo) => keys.includes(photo.key)).forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    setPhotos((current) => current.filter((photo) => !keys.includes(photo.key)));
  };

  const movePhoto = (move: { from: number; to: number }) => setPhotos((current) => getMovedItems(current, move));

  /** Explains beside every photo without a description what to write, and moves to the first. */
  const showMissingDescriptions = () => {
    if (!firstMissing) return;
    setPhotos((current) => current.map(getCheckedPhoto));
    document.getElementById(getPendingPhotoFieldId(firstMissing.key))?.focus();
    showToast({ tone: "error", title: MISSING_ALT_TOAST });
  };

  return { photos, firstMissing, addFiles, replaceWithFile, setAlt, removePhotos, movePhoto, showMissingDescriptions };
}

export type PendingPhotos = ReturnType<typeof usePendingPhotos>;

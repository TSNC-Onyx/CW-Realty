"use client";

import { useState } from "react";

import { encodePhoto, PhotoProblemError } from "@/lib/admin/photos/encode-photo";
import type { EncodedVariant } from "@/workers/photo-encoder";
import { requestPhotoUploadAction, type PhotoTarget } from "@/lib/admin/photos/actions";
import { PHOTO_CONTENT_TYPES } from "@/lib/admin/photos/photo-files";
import type { SignedUpload } from "@/lib/admin/photos/photo-storage";

// Prepares and uploads one photo: encode in the browser → get upload links → send every
// file. The caller then saves the photo record, which the server allows only once all
// files are present.

export type UploadedPhoto = { folder: string; width: number; height: number };

export type UploadProgress = { stage: "idle" | "preparing" | "uploading"; share: number; error: string | null };

const IDLE_PROGRESS: UploadProgress = { stage: "idle", share: 0, error: null };

class UploadFailedError extends Error {
  constructor(readonly context: { status: number }) {
    super("A photo file didn't upload. Check your connection and try again.");
    this.name = "UploadFailedError";
  }
}

async function sendVariant(upload: SignedUpload, variant: EncodedVariant): Promise<void> {
  const response = await fetch(upload.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": PHOTO_CONTENT_TYPES[variant.format], "x-upsert": "true" },
    body: new Blob([variant.bytes], { type: PHOTO_CONTENT_TYPES[variant.format] }),
  });
  if (!response.ok) throw new UploadFailedError({ status: response.status });
}

function getMatchingVariant(variants: EncodedVariant[], upload: SignedUpload): EncodedVariant {
  const variant = variants.find((candidate) => candidate.width === upload.width && candidate.format === upload.format);
  if (!variant) throw new UploadFailedError({ status: 0 });
  return variant;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof PhotoProblemError || error instanceof UploadFailedError) return error.message;
  return "The photo couldn't be uploaded. Try again.";
}

export function usePhotoUpload(target: PhotoTarget) {
  const [progress, setProgress] = useState<UploadProgress>(IDLE_PROGRESS);

  const uploadPhoto = async (file: File): Promise<UploadedPhoto | null> => {
    try {
      setProgress({ stage: "preparing", share: 0, error: null });
      const encoded = await encodePhoto(file, (share) => setProgress({ stage: "preparing", share, error: null }));
      setProgress({ stage: "uploading", share: 0, error: null });
      const ticket = await requestPhotoUploadAction(target);
      if (ticket.status === "error") throw new PhotoProblemError(ticket.message, { fileName: file.name });
      await Promise.all(ticket.uploads.map((upload) => sendVariant(upload, getMatchingVariant(encoded.variants, upload))));
      setProgress(IDLE_PROGRESS);
      return { folder: ticket.folder, width: encoded.width, height: encoded.height };
    } catch (error) {
      setProgress({ stage: "idle", share: 0, error: getErrorMessage(error) });
      return null;
    }
  };

  return { progress, uploadPhoto, clearError: () => setProgress(IDLE_PROGRESS) };
}

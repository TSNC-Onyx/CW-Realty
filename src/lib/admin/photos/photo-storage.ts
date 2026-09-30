import "server-only";

import { getPhotoVariantNames, getVariantFileName, PHOTO_BUCKET } from "@/lib/admin/photos/photo-files";
import { noteProblemCause } from "@/lib/observability/action-context";
import { createServiceClient } from "@/lib/supabase/service-client";

// Server-side storage steps for admin photos. Called only after requireAdmin has checked
// the caller and the record, because the service-role key bypasses storage rules.

const LIST_LIMIT = 100;
const INCOMPLETE_MESSAGE = "The photo didn't finish uploading. Try again.";
const UNCHECKED_MESSAGE = "We couldn't check the upload. Try again in a moment.";

export type SignedUpload = { width: number; format: string; signedUrl: string };

/** "unchecked": storage couldn't be listed, which is never the same as an unfinished upload. */
export type PhotoFilesCheck = "complete" | "incomplete" | "unchecked";

export class PhotoStorageError extends Error {
  constructor(message: string, readonly context: { folder: string; cause?: unknown }) {
    super(message);
    this.name = "PhotoStorageError";
  }
}

export function getPhotoFilesMessage(check: Exclude<PhotoFilesCheck, "complete">): string {
  return check === "unchecked" ? UNCHECKED_MESSAGE : INCOMPLETE_MESSAGE;
}

export async function createSignedUploads(folder: string): Promise<SignedUpload[]> {
  const storage = createServiceClient().storage.from(PHOTO_BUCKET);
  return Promise.all(
    getPhotoVariantNames().map(async (variant) => {
      const { data, error } = await storage.createSignedUploadUrl(`${folder}/${getVariantFileName(variant)}`, { upsert: true });
      if (error || !data) throw new PhotoStorageError("Could not create an upload link", { folder, cause: error });
      return { ...variant, signedUrl: data.signedUrl };
    }),
  );
}

/** Whether every width/format file of the photo is in storage. A list error is noted as the action's cause. */
export async function fetchPhotoFilesCheck(folder: string): Promise<PhotoFilesCheck> {
  const { data: files, error } = await createServiceClient().storage.from(PHOTO_BUCKET).list(folder, { limit: LIST_LIMIT });
  if (error) {
    noteProblemCause({ stage: "storage", severity: "error", code: error.name || "StorageError", detail: error.message });
    return "unchecked";
  }
  const storedNames = new Set((files ?? []).map((file) => file.name));
  return getPhotoVariantNames().every((variant) => storedNames.has(getVariantFileName(variant))) ? "complete" : "incomplete";
}

/** True when every width/format file of the photo is in storage (a list error counts as false, and is noted). */
export async function hasAllPhotoFiles(folder: string): Promise<boolean> {
  return (await fetchPhotoFilesCheck(folder)) === "complete";
}

export async function removePhotoFiles(folders: string[]): Promise<void> {
  if (folders.length === 0) return;
  const paths = folders.flatMap((folder) => getPhotoVariantNames().map((variant) => `${folder}/${getVariantFileName(variant)}`));
  const { error } = await createServiceClient().storage.from(PHOTO_BUCKET).remove(paths);
  if (error) throw new PhotoStorageError("Could not remove photo files", { folder: folders.join(", "), cause: error });
}

import "server-only";

import { getPhotoVariantNames, getVariantFileName, PHOTO_BUCKET } from "@/lib/admin/photos/photo-files";
import { createServiceClient } from "@/lib/supabase/service-client";

// Server-side storage steps for admin photos. Called only after requireAdmin has checked
// the caller and the record, because the service-role key bypasses storage rules.

export type SignedUpload = { width: number; format: string; signedUrl: string };

export class PhotoStorageError extends Error {
  constructor(message: string, readonly context: { folder: string; cause?: unknown }) {
    super(message);
    this.name = "PhotoStorageError";
  }
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

/** True when every width/format file of the photo is in storage. */
export async function hasAllPhotoFiles(folder: string): Promise<boolean> {
  const { data: files, error } = await createServiceClient().storage.from(PHOTO_BUCKET).list(folder, { limit: 100 });
  if (error || !files) return false;
  const storedNames = new Set(files.map((file) => file.name));
  return getPhotoVariantNames().every((variant) => storedNames.has(getVariantFileName(variant)));
}

export async function removePhotoFiles(folders: string[]): Promise<void> {
  if (folders.length === 0) return;
  const paths = folders.flatMap((folder) => getPhotoVariantNames().map((variant) => `${folder}/${getVariantFileName(variant)}`));
  const { error } = await createServiceClient().storage.from(PHOTO_BUCKET).remove(paths);
  if (error) throw new PhotoStorageError("Could not remove photo files", { folder: folders.join(", "), cause: error });
}

"use client";

import { uploadPhotoFile, type UploadedPhoto } from "@/components/admin/photos/use-photo-upload";
import type { PhotoTarget } from "@/lib/admin/photos/actions";
import type { QuickResult } from "@/lib/admin/quick-result";
import { callQuickAction } from "@/lib/observability/call-server-action";
import type { ProblemAction } from "@/lib/observability/problem-catalog";

// One photo, start to finish: prepare and send its files, then save its record. Every
// failure is already recorded by the steps it uses; this returns the message to show.

type PhotoRecordUpload = {
  target: PhotoTarget;
  file: File;
  /** Catalog name of the action that saves the record, so a failed call is recorded under it. */
  saveProblemAction: ProblemAction;
  save: (photo: UploadedPhoto) => Promise<QuickResult>;
};

/** null when the photo was uploaded and saved; otherwise what went wrong. */
export async function fetchPhotoRecordProblem({ target, file, saveProblemAction, save }: PhotoRecordUpload): Promise<string | null> {
  const upload = await uploadPhotoFile({ target, file, onProgress: () => undefined });
  if (upload.error !== null) return upload.error;
  const result = await callQuickAction(saveProblemAction, () => save(upload.photo));
  return result.status === "success" ? null : result.message;
}

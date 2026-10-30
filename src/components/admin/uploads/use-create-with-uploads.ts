"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { useUnsavedChanges } from "@/components/admin/use-unsaved-changes";
import type { ActionState } from "@/lib/admin/action-state";
import { getCreatedHref } from "@/lib/admin/created-href";

// Add pages save the details first, then upload the chosen files to the new record, then open
// it (owner choice 2026-10-10, docs/admin-upload-layout-plan.md). Leaving mid-upload asks first.

/** Uploads the files to the new record; reports progress through showStatus and returns how many failed. */
export type UploadToRecord = (options: { recordId: string; showStatus: (text: string) => void }) => Promise<number>;

const SAVED_STATUS = "Saved. Starting the upload…";

export function useCreateWithUploads({ editPath, uploadToRecord }: { editPath: string; uploadToRecord: UploadToRecord }) {
  const router = useRouter();
  const [uploadStatus, setUploadStatus] = useState("");
  const isUploading = uploadStatus !== "";
  useUnsavedChanges(isUploading);

  const handleCreated = async (state: ActionState) => {
    const recordId = state.createdId;
    if (!recordId) return;
    setUploadStatus(SAVED_STATUS);
    const missedCount = await uploadToRecord({ recordId, showStatus: setUploadStatus });
    router.push(getCreatedHref({ editPath, recordId, missedCount }));
  };

  return { isUploading, uploadStatus, handleCreated };
}

type GuardedSubmit = {
  isBusy: boolean;
  /** Explains what is missing before saving (a photo description, the video), or null when nothing is. */
  showBlocker: (() => void) | null;
  submit: (event: FormEvent<HTMLFormElement>) => void;
};

/** Submits an Add form unless it is already saving or something must be fixed first. */
export function handleGuardedSubmit(event: FormEvent<HTMLFormElement>, { isBusy, showBlocker, submit }: GuardedSubmit): void {
  if (!isBusy && !showBlocker) return submit(event);
  event.preventDefault();
  if (!isBusy) showBlocker?.();
}

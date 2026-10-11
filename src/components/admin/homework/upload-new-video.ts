"use client";

import { getStageText } from "@/components/admin/homework/homework-file-upload";
import type { CoverNotice } from "@/components/admin/homework/make-video-cover";
import { uploadHomeworkFile } from "@/components/admin/homework/use-homework-upload";
import { fetchPhotoRecordProblem } from "@/components/admin/uploads/upload-photo-record";
import type { PendingPhoto } from "@/components/admin/uploads/use-pending-photos";
import { setHomeworkCoverAction } from "@/lib/admin/homework/actions";

// Add video → after the details are saved: the video (with a cover from its opening scene
// unless one was picked), then the picked cover, then the captions (docs/admin-upload-layout-plan.md).
// Each step runs even if an earlier one failed, so as much as possible is saved.

export type NewVideoFiles = { video: File; cover: PendingPhoto | null; captions: File | null };

type NewVideoUpload = {
  itemId: string;
  files: NewVideoFiles;
  showStatus: (text: string) => void;
  showProblem: (problem: { title: string; message: string }) => void;
  showCoverNotice: (notice: CoverNotice) => void;
};

async function fetchIsVideoUploaded({ itemId, files, showStatus, showProblem, showCoverNotice }: NewVideoUpload): Promise<boolean> {
  const result = await uploadHomeworkFile({ itemId, purpose: "video", file: files.video, isMakingCover: files.cover === null, onProgress: (progress) => showStatus(getStageText(progress)) });
  if (result.status === "error") showProblem({ title: "The video didn't upload", message: result.message });
  if (result.coverNotice) showCoverNotice(result.coverNotice);
  return result.status === "success";
}

async function fetchIsCoverUploaded({ itemId, cover, showStatus, showProblem }: Omit<NewVideoUpload, "files" | "showCoverNotice"> & { cover: PendingPhoto }): Promise<boolean> {
  showStatus("Uploading the cover picture…");
  const problem = await fetchPhotoRecordProblem({
    target: { kind: "homework", recordId: itemId },
    file: cover.file,
    saveProblemAction: "homework.set_cover",
    save: (uploaded) => setHomeworkCoverAction({ itemId, ...uploaded, alt: cover.alt }),
  });
  if (problem !== null) showProblem({ title: "The cover picture didn't upload", message: problem });
  return problem === null;
}

async function fetchIsCaptionsUploaded({ itemId, captions, showStatus, showProblem }: Omit<NewVideoUpload, "files" | "showCoverNotice"> & { captions: File }): Promise<boolean> {
  const result = await uploadHomeworkFile({ itemId, purpose: "captions", file: captions, isMakingCover: false, onProgress: (progress) => showStatus(`Captions: ${getStageText(progress)}`) });
  if (result.status === "error") showProblem({ title: "The captions didn't upload", message: result.message });
  return result.status === "success";
}

/** Uploads every chosen file to the new video; returns how many didn't upload. */
export async function fetchMissedVideoFileCount(upload: NewVideoUpload): Promise<number> {
  const { cover, captions } = upload.files;
  const outcomes = [await fetchIsVideoUploaded(upload)];
  if (cover) outcomes.push(await fetchIsCoverUploaded({ ...upload, cover }));
  if (captions) outcomes.push(await fetchIsCaptionsUploaded({ ...upload, captions }));
  return outcomes.filter((isUploaded) => !isUploaded).length;
}

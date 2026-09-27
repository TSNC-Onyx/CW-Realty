"use client";

import { useState } from "react";

import type { QuickResult } from "@/lib/admin/quick-result";
import { requestHomeworkUploadAction, saveHomeworkFileAction } from "@/lib/admin/homework/upload-actions";
import { getUploadProblem, type UploadPurpose } from "@/lib/content/homework-rules";

// One Homework upload: check the file here first, read a video's length, get a one-time
// link, send the file straight to storage (with progress, since videos can be large),
// then ask the server to confirm and record it.

export type HomeworkUploadProgress = { stage: "idle" | "checking" | "uploading" | "saving"; share: number; error: string | null };

const IDLE_PROGRESS: HomeworkUploadProgress = { stage: "idle", share: 0, error: null };
const METADATA_TIMEOUT_MS = 15_000;
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 299;

class HomeworkUploadError extends Error {
  constructor(message: string, readonly context: { stage: string; status?: number }) {
    super(message);
    this.name = "HomeworkUploadError";
  }
}

/** The video's length in seconds, read in the browser; null when the browser can't tell. */
function readVideoSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const finish = (seconds: number | null) => {
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    const timer = window.setTimeout(() => finish(null), METADATA_TIMEOUT_MS);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      window.clearTimeout(timer);
      finish(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null);
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      finish(null);
    };
    video.src = url;
  });
}

function sendFile({ signedUrl, contentType, file, onProgress }: { signedUrl: string; contentType: string; file: File; onProgress: (share: number) => void }): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", signedUrl);
    request.setRequestHeader("Content-Type", contentType);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      const isOk = request.status >= HTTP_OK_MIN && request.status <= HTTP_OK_MAX;
      if (isOk) resolve();
      else reject(new HomeworkUploadError("The file didn't upload. Check your connection and try again.", { stage: "upload", status: request.status }));
    };
    request.onerror = () => reject(new HomeworkUploadError("The file didn't upload. Check your connection and try again.", { stage: "upload" }));
    request.send(file);
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof HomeworkUploadError) return error.message;
  return "The file couldn't be uploaded. Try again.";
}

export function useHomeworkUpload({ itemId, purpose }: { itemId: string; purpose: UploadPurpose }) {
  const [progress, setProgress] = useState<HomeworkUploadProgress>(IDLE_PROGRESS);

  const uploadFile = async (file: File): Promise<QuickResult | null> => {
    try {
      const problem = getUploadProblem({ purpose, fileName: file.name, sizeBytes: file.size });
      if (problem) throw new HomeworkUploadError(problem, { stage: "check" });
      setProgress({ stage: "checking", share: 0, error: null });
      const durationSeconds = purpose === "video" ? await readVideoSeconds(file) : null;
      const ticket = await requestHomeworkUploadAction({ itemId, purpose, fileName: file.name, sizeBytes: file.size });
      if (ticket.status === "error") throw new HomeworkUploadError(ticket.message, { stage: "ticket" });
      await sendFile({ signedUrl: ticket.signedUrl, contentType: ticket.contentType, file, onProgress: (share) => setProgress({ stage: "uploading", share, error: null }) });
      setProgress({ stage: "saving", share: 1, error: null });
      const result = await saveHomeworkFileAction({ itemId, purpose, path: ticket.path, fileName: file.name, durationSeconds });
      setProgress(result.status === "error" ? { stage: "idle", share: 0, error: result.message } : IDLE_PROGRESS);
      return result;
    } catch (error) {
      setProgress({ stage: "idle", share: 0, error: getErrorMessage(error) });
      return null;
    }
  };

  return { progress, uploadFile, clearError: () => setProgress(IDLE_PROGRESS) };
}

"use client";

import { unstable_rethrow } from "next/navigation";
import { useState } from "react";

import { fetchVideoCoverNotice, type CoverNotice } from "@/components/admin/homework/make-video-cover";
import { getHttpProblem, getMessageWithReference, getTransferProblem, getUploadTimeoutMs, type TransferFailureCode, type UploadProblem } from "@/components/admin/homework/upload-problems";
import { getQuickError, type QuickResult } from "@/lib/admin/quick-result";
import { requestHomeworkUploadAction, saveHomeworkFileAction, type UploadTicket } from "@/lib/admin/homework/upload-actions";
import { getUploadProblem, type UploadPurpose } from "@/lib/content/homework-rules";
import { callQuickAction, getCallFailure, getErrorDigest } from "@/lib/observability/call-server-action";
import type { ProblemAction } from "@/lib/observability/problem-catalog";
import { reportClientProblem } from "@/lib/observability/report-client-problem";

// One Homework upload: check the file here first, read a video's length, get a one-time
// link, send the file straight to storage (with progress, since videos can be large),
// then ask the server to confirm and record it. A saved video without an uploaded cover then
// gets one from its opening scene (docs/cwr-video-auto-cover-plan.md). Every step always
// finishes — the screen never stays on "Uploading…" — and every failure is recorded
// (docs/cwr-error-tracking-plan.md).

export type HomeworkUploadProgress = { stage: "idle" | "checking" | "uploading" | "saving" | "cover"; share: number; error: string | null };

/** coverNotice: what happened to the automatic cover, when one was attempted. */
export type HomeworkUploadResult = QuickResult & { coverNotice: CoverNotice | null };

const IDLE_PROGRESS: HomeworkUploadProgress = { stage: "idle", share: 0, error: null };
const UPLOAD_FILE_ACTION: ProblemAction = "homework.upload_file";
const REQUEST_UPLOAD_ACTION: ProblemAction = "homework.request_upload_link";
const SAVE_FILE_ACTION: ProblemAction = "homework.save_file";
const METADATA_TIMEOUT_MS = 15_000;
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 299;
const UNEXPECTED_MESSAGE = "The file couldn't be uploaded. Try again.";

type VideoLengthReading = { isRead: true; seconds: number | null } | { isRead: false; detail: string };

export type UploadSteps = { itemId: string; purpose: UploadPurpose; file: File; isMakingCover: boolean; onProgress: (progress: HomeworkUploadProgress) => void };

class HomeworkUploadError extends Error {
  constructor(readonly problem: UploadProblem) {
    super(problem.message);
    this.name = "HomeworkUploadError";
  }
}

function getFiniteSeconds(duration: number): number | null {
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

function getMediaErrorDetail(error: MediaError | null): string {
  return error ? `MediaError ${error.code}: ${error.message}` : "The video could not be read.";
}

function getUnexpectedProblem(error: unknown): UploadProblem {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return { stage: "unexpected", severity: "error", code: "other", message: UNEXPECTED_MESSAGE, detail };
}

/** The video's length in seconds; a failed read is returned, not hidden, so it can be recorded. */
function readVideoSeconds(file: File): Promise<VideoLengthReading> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    let timer = 0;
    const finish = (reading: VideoLengthReading) => {
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(reading);
    };
    timer = window.setTimeout(() => finish({ isRead: false, detail: `No video details after ${METADATA_TIMEOUT_MS} ms` }), METADATA_TIMEOUT_MS);
    video.preload = "metadata";
    video.onloadedmetadata = () => finish({ isRead: true, seconds: getFiniteSeconds(video.duration) });
    video.onerror = () => finish({ isRead: false, detail: getMediaErrorDetail(video.error) });
    video.src = url;
  });
}

// The length is a convenience: when the browser can't read it, the upload goes on without it.
async function fetchVideoSeconds(file: File): Promise<number | null> {
  const reading = await readVideoSeconds(file);
  if (reading.isRead) return reading.seconds;
  void reportClientProblem({ action: UPLOAD_FILE_ACTION, stage: "browser", severity: "info", code: "decode_error", detail: reading.detail });
  return null;
}

/** Settles on every outcome: success, HTTP error, network error, timeout, or abort. */
function sendFile({ ticket, file, onShare }: { ticket: Extract<UploadTicket, { status: "ready" }>; file: File; onShare: (share: number) => void }): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const timeoutMs = getUploadTimeoutMs(file.size);
    const fail = (code: TransferFailureCode) => reject(new HomeworkUploadError(getTransferProblem({ code, sizeBytes: file.size, timeoutMs })));
    request.open("PUT", ticket.signedUrl);
    request.timeout = timeoutMs;
    request.setRequestHeader("Content-Type", ticket.contentType);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onShare(event.loaded / event.total);
    };
    request.onload = () => {
      const isOk = request.status >= HTTP_OK_MIN && request.status <= HTTP_OK_MAX;
      if (isOk) resolve();
      else reject(new HomeworkUploadError(getHttpProblem({ status: request.status, responseText: request.responseText })));
    };
    request.onerror = () => fail("network");
    request.ontimeout = () => fail("timeout");
    request.onabort = () => fail("aborted");
    request.send(file);
  });
}

// A ticket call that fails outright (stale page, dropped connection) becomes an error ticket, as callQuickAction does for one-click actions.
async function fetchUploadTicket(input: Parameters<typeof requestHomeworkUploadAction>[0]): Promise<UploadTicket> {
  try {
    return await requestHomeworkUploadAction(input);
  } catch (error) {
    unstable_rethrow(error);
    const failure = getCallFailure(error);
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const reference = await reportClientProblem({ action: REQUEST_UPLOAD_ACTION, stage: "network", severity: failure.severity, code: failure.code, shownMessage: failure.message, detail, digest: getErrorDigest(error) });
    return { status: "error", message: getMessageWithReference({ message: failure.message, severity: failure.severity, reference }) };
  }
}

async function runUploadSteps({ itemId, purpose, file, onProgress }: Omit<UploadSteps, "isMakingCover">): Promise<QuickResult> {
  const rejection = getUploadProblem({ purpose, fileName: file.name, sizeBytes: file.size });
  if (rejection) throw new HomeworkUploadError({ stage: "browser", severity: "info", code: "file_rejected", message: rejection, detail: `${purpose}, ${file.type || "no type"}, ${file.size} bytes` });
  onProgress({ stage: "checking", share: 0, error: null });
  const durationSeconds = purpose === "video" ? await fetchVideoSeconds(file) : null;
  const ticket = await fetchUploadTicket({ itemId, purpose, fileName: file.name, sizeBytes: file.size });
  if (ticket.status === "error") return getQuickError(ticket.message);
  await sendFile({ ticket, file, onShare: (share) => onProgress({ stage: "uploading", share, error: null }) });
  onProgress({ stage: "saving", share: 1, error: null });
  return callQuickAction(SAVE_FILE_ACTION, () => saveHomeworkFileAction({ itemId, purpose, path: ticket.path, fileName: file.name, durationSeconds }));
}

async function getReportedUploadMessage(error: unknown): Promise<string> {
  const { message, ...problem } = error instanceof HomeworkUploadError ? error.problem : getUnexpectedProblem(error);
  const reference = await reportClientProblem({ ...problem, action: UPLOAD_FILE_ACTION, shownMessage: message });
  return getMessageWithReference({ message, severity: problem.severity, reference });
}

// Boundary for the browser steps: every failure ends as an error result the screen can show.
async function getUploadResult(steps: UploadSteps): Promise<QuickResult> {
  try {
    return await runUploadSteps(steps);
  } catch (error) {
    unstable_rethrow(error);
    return getQuickError(await getReportedUploadMessage(error));
  }
}

/** One upload to an item, start to finish (used directly when the item was only just created). */
export async function uploadHomeworkFile(steps: UploadSteps): Promise<HomeworkUploadResult> {
  const result = await getUploadResult(steps);
  if (result.status === "error" || !steps.isMakingCover) return { ...result, coverNotice: null };
  steps.onProgress({ stage: "cover", share: 1, error: null });
  return { ...result, coverNotice: await fetchVideoCoverNotice({ itemId: steps.itemId, file: steps.file }) };
}

/** isMakingCover: make a cover from the video's opening scene once it is saved. */
export function useHomeworkUpload({ itemId, purpose, isMakingCover }: { itemId: string; purpose: UploadPurpose; isMakingCover: boolean }) {
  const [progress, setProgress] = useState<HomeworkUploadProgress>(IDLE_PROGRESS);

  const uploadFile = async (file: File): Promise<HomeworkUploadResult> => {
    const result = await uploadHomeworkFile({ itemId, purpose, file, isMakingCover, onProgress: setProgress });
    setProgress(result.status === "error" ? { stage: "idle", share: 0, error: result.message } : IDLE_PROGRESS);
    return result;
  };

  return { progress, uploadFile, clearError: () => setProgress(IDLE_PROGRESS) };
}

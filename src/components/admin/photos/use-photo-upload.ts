"use client";

import { unstable_rethrow } from "next/navigation";
import { useState } from "react";

import { encodePhoto, encodePhotoBitmap, PhotoProblemError, type EncodedPhoto, type PhotoProblemCode } from "@/lib/admin/photos/encode-photo";
import type { EncodedVariant } from "@/workers/photo-encoder";
import { requestPhotoUploadAction, type PhotoTarget, type PhotoUploadTicket } from "@/lib/admin/photos/actions";
import { PHOTO_CONTENT_TYPES } from "@/lib/admin/photos/photo-files";
import type { SignedUpload } from "@/lib/admin/photos/photo-storage";
import { getCallFailure } from "@/lib/observability/call-server-action";
import { getHttpProblemCode, type ClientProblem } from "@/lib/observability/client-problem";
import { isReferenceWorthy, type ProblemSeverity } from "@/lib/observability/problem-types";
import { reportClientProblem } from "@/lib/observability/report-client-problem";

// Prepares and uploads one photo: encode in the browser → get upload links → send every
// file. The caller then saves the photo record, which the server allows only once all
// files are present. Every failure is recorded (docs/cwr-error-tracking-plan.md); the
// upload-link step records its own on the server.

export type UploadedPhoto = { folder: string; width: number; height: number };

export type UploadProgress = { stage: "idle" | "preparing" | "uploading"; share: number; error: string | null };

/** problem: null when the failure was already recorded on the server. */
type StepFailure = { message: string; problem: Omit<ClientProblem, "shownMessage"> | null };

const IDLE_PROGRESS: UploadProgress = { stage: "idle", share: 0, error: null };
const PREPARE_FAILED_MESSAGE = "The photo couldn't be prepared. Try again.";
const UPLOAD_FAILED_MESSAGE = "A photo file didn't upload. Check your connection and try again.";
const PREPARE_SEVERITIES: Record<PhotoProblemCode, ProblemSeverity> = { file_rejected: "info", decode_error: "warning", worker_error: "error" };

class PhotoStepError extends Error {
  constructor(readonly failure: StepFailure) {
    super(failure.message);
    this.name = "PhotoStepError";
  }
}

function getErrorDetail(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function getPrepareFailure(error: unknown): StepFailure {
  if (!(error instanceof PhotoProblemError)) {
    return { message: PREPARE_FAILED_MESSAGE, problem: { action: "photos.prepare", stage: "browser", severity: "error", code: "other", detail: getErrorDetail(error) } };
  }
  const { code, detail } = error.context;
  return { message: error.message, problem: { action: "photos.prepare", stage: "browser", severity: PREPARE_SEVERITIES[code], code, detail: detail ?? undefined } };
}

function getTicketCallFailure(error: unknown): StepFailure {
  const { code, severity, message } = getCallFailure(error);
  return { message, problem: { action: "photos.request_upload_link", stage: "network", severity, code, detail: getErrorDetail(error) } };
}

function getUploadFailure({ status, detail }: { status: number | null; detail: string }): StepFailure {
  const code = status === null ? "network" : getHttpProblemCode(status);
  return { message: UPLOAD_FAILED_MESSAGE, problem: { action: "photos.upload", stage: "network", severity: status === null ? "warning" : "error", code, detail } };
}

async function getShownMessage({ message, problem }: StepFailure): Promise<string> {
  if (!problem) return message;
  const reference = await reportClientProblem({ ...problem, shownMessage: message });
  return reference && isReferenceWorthy(problem.severity) ? `${message} (Ref ${reference})` : message;
}

async function preparePhoto(file: File, onProgress: (share: number) => void): Promise<EncodedPhoto> {
  return encodePhoto(file, onProgress).catch((error: unknown) => {
    throw new PhotoStepError(getPrepareFailure(error));
  });
}

/** Encodes a frame taken from a video (automatic Homework covers). */
export async function prepareFramePhoto(bitmap: ImageBitmap): Promise<EncodedPhoto> {
  return encodePhotoBitmap(bitmap, () => undefined).catch((error: unknown) => {
    throw new PhotoStepError(getPrepareFailure(error));
  });
}

async function fetchTicket(target: PhotoTarget): Promise<Extract<PhotoUploadTicket, { status: "ready" }>> {
  const ticket = await requestPhotoUploadAction(target).catch((error: unknown) => {
    unstable_rethrow(error);
    throw new PhotoStepError(getTicketCallFailure(error));
  });
  if (ticket.status === "error") throw new PhotoStepError({ message: ticket.message, problem: null });
  return ticket;
}

async function sendVariant(upload: SignedUpload, variant: EncodedVariant): Promise<void> {
  const response = await fetch(upload.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": PHOTO_CONTENT_TYPES[variant.format], "x-upsert": "true" },
    body: new Blob([variant.bytes], { type: PHOTO_CONTENT_TYPES[variant.format] }),
  }).catch((error: unknown) => {
    throw new PhotoStepError(getUploadFailure({ status: null, detail: getErrorDetail(error) }));
  });
  if (!response.ok) throw new PhotoStepError(getUploadFailure({ status: response.status, detail: `PUT ${variant.width}.${variant.format}: HTTP ${response.status}` }));
}

function getMatchingVariant(variants: EncodedVariant[], upload: SignedUpload): EncodedVariant {
  const variant = variants.find((candidate) => candidate.width === upload.width && candidate.format === upload.format);
  if (variant) return variant;
  const detail = `No ${upload.width}.${upload.format} file was prepared`;
  throw new PhotoStepError({ message: PREPARE_FAILED_MESSAGE, problem: { action: "photos.prepare", stage: "browser", severity: "error", code: "other", detail } });
}

function getFailure(error: unknown): StepFailure {
  if (error instanceof PhotoStepError) return error.failure;
  return { message: PREPARE_FAILED_MESSAGE, problem: { action: "photos.upload", stage: "unexpected", severity: "error", code: "other", detail: getErrorDetail(error) } };
}

/** Gets upload links for a prepared photo and sends every file; failures throw for fetchReportedPhotoMessage. */
export async function sendEncodedPhoto(target: PhotoTarget, encoded: EncodedPhoto): Promise<UploadedPhoto> {
  const ticket = await fetchTicket(target);
  await Promise.all(ticket.uploads.map((upload) => sendVariant(upload, getMatchingVariant(encoded.variants, upload))));
  return { folder: ticket.folder, width: encoded.width, height: encoded.height };
}

/** The message for a failed photo step; when the server recorded the failure it carries the reference code. */
export function getPhotoStepMessage(error: unknown): string {
  return getFailure(error).message;
}

/** What went wrong in a photo step, for callers that record it under their own action; null when the server already recorded it. */
export function getPhotoStepProblem(error: unknown): Omit<ClientProblem, "shownMessage" | "action"> | null {
  const { problem } = getFailure(error);
  if (!problem) return null;
  return { stage: problem.stage, severity: problem.severity, code: problem.code, detail: problem.detail };
}

export function usePhotoUpload(target: PhotoTarget) {
  const [progress, setProgress] = useState<UploadProgress>(IDLE_PROGRESS);

  const uploadPhoto = async (file: File): Promise<UploadedPhoto | null> => {
    try {
      setProgress({ stage: "preparing", share: 0, error: null });
      const encoded = await preparePhoto(file, (share) => setProgress({ stage: "preparing", share, error: null }));
      setProgress({ stage: "uploading", share: 0, error: null });
      const uploaded = await sendEncodedPhoto(target, encoded);
      setProgress(IDLE_PROGRESS);
      return uploaded;
    } catch (error) {
      unstable_rethrow(error);
      setProgress({ stage: "idle", share: 0, error: await getShownMessage(getFailure(error)) });
      return null;
    }
  };

  return { progress, uploadPhoto, clearError: () => setProgress(IDLE_PROGRESS) };
}

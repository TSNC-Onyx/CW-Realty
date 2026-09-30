import "server-only";

import { HOMEWORK_FILES_BUCKET } from "@/lib/content/homework-rules";
import type { ProblemCause } from "@/lib/observability/action-context";
import { createServiceClient } from "@/lib/supabase/service-client";

// Server-side storage steps for Homework files (videos, guides, captions) in the public
// cwr-files bucket. Called only after requireAdmin has checked the caller and the item,
// because the service-role key bypasses storage rules. A storage failure is always returned
// as a failure, never mistaken for "no file" or "not a captions file".

const CAPTIONS_SIGNATURE = /^﻿?WEBVTT/;
const CAPTIONS_PEEK_BYTES = 16;
const STORAGE_ERROR_CODE = "StorageError";
const EMPTY_RESPONSE: StorageFailure = { code: "empty_response", detail: "Storage answered without an error or any data." };

export type StorageFailure = { code: string; detail: string };

export type StoredFileInfo = { sizeBytes: number; mime: string };

export type StoredFileCheck = { status: "found"; file: StoredFileInfo } | { status: "missing" } | { status: "failed"; failure: StorageFailure };

export type CaptionsCheck = { status: "captions" } | { status: "not_captions" } | { status: "failed"; failure: StorageFailure };

export class HomeworkStorageError extends Error {
  constructor(message: string, readonly context: { path: string; failure: StorageFailure }) {
    super(message);
    this.name = "HomeworkStorageError";
  }
}

function getBucket() {
  return createServiceClient().storage.from(HOMEWORK_FILES_BUCKET);
}

function getFolderAndName(path: string): { folder: string; name: string } {
  const lastSlash = path.lastIndexOf("/");
  return { folder: path.slice(0, lastSlash), name: path.slice(lastSlash + 1) };
}

function getStorageFailure(error: { name?: string; message: string } | null): StorageFailure {
  if (!error) return EMPTY_RESPONSE;
  return { code: error.name ?? STORAGE_ERROR_CODE, detail: error.message };
}

/** How a storage failure is recorded when it stops an admin action. */
export function getStorageProblemCause(failure: StorageFailure): ProblemCause {
  return { stage: "storage", severity: "error", code: failure.code, detail: failure.detail };
}

/** A one-time link the browser uses to upload the file straight to storage. */
export async function createSignedFileUpload(path: string): Promise<string> {
  const { data, error } = await getBucket().createSignedUploadUrl(path);
  if (error || !data) throw new HomeworkStorageError("Could not create an upload link", { path, failure: getStorageFailure(error) });
  return data.signedUrl;
}

/** The stored size and type; "missing" only when storage answered and the file is not there. */
export async function fetchStoredFileInfo(path: string): Promise<StoredFileCheck> {
  const { folder, name } = getFolderAndName(path);
  const { data: files, error } = await getBucket().list(folder, { search: name, limit: 10 });
  if (error || !files) return { status: "failed", failure: getStorageFailure(error) };
  const file = files.find((candidate) => candidate.name === name);
  const sizeBytes = Number(file?.metadata?.size);
  const mime = String(file?.metadata?.mimetype ?? "");
  return Number.isFinite(sizeBytes) && sizeBytes > 0 ? { status: "found", file: { sizeBytes, mime } } : { status: "missing" };
}

/** Whether a stored captions file starts with the WebVTT signature. */
export async function fetchCaptionsCheck(path: string): Promise<CaptionsCheck> {
  const { data, error } = await getBucket().download(path);
  if (error || !data) return { status: "failed", failure: getStorageFailure(error) };
  const start = await data.slice(0, CAPTIONS_PEEK_BYTES).text();
  return CAPTIONS_SIGNATURE.test(start) ? { status: "captions" } : { status: "not_captions" };
}

/** Removes stored files; returns the failure instead of throwing, so callers decide how to report it. */
export async function removeHomeworkFiles(paths: string[]): Promise<StorageFailure | null> {
  if (paths.length === 0) return null;
  const { error } = await getBucket().remove(paths);
  return error ? getStorageFailure(error) : null;
}

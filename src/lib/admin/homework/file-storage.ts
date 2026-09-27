import "server-only";

import { HOMEWORK_FILES_BUCKET } from "@/lib/content/homework-rules";
import { createServiceClient } from "@/lib/supabase/service-client";

// Server-side storage steps for Homework files (videos, guides, captions) in the public
// cwr-files bucket. Called only after requireAdmin has checked the caller and the item,
// because the service-role key bypasses storage rules.

const CAPTIONS_SIGNATURE = /^﻿?WEBVTT/;
const CAPTIONS_PEEK_BYTES = 16;

export class HomeworkStorageError extends Error {
  constructor(message: string, readonly context: { path: string; cause?: unknown }) {
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

/** A one-time link the browser uses to upload the file straight to storage. */
export async function createSignedFileUpload(path: string): Promise<string> {
  const { data, error } = await getBucket().createSignedUploadUrl(path);
  if (error || !data) throw new HomeworkStorageError("Could not create an upload link", { path, cause: error });
  return data.signedUrl;
}

export type StoredFileInfo = { sizeBytes: number; mime: string };

/** The stored size and type, or null when the file is not in storage. */
export async function fetchStoredFileInfo(path: string): Promise<StoredFileInfo | null> {
  const { folder, name } = getFolderAndName(path);
  const { data: files, error } = await getBucket().list(folder, { search: name, limit: 10 });
  if (error || !files) return null;
  const file = files.find((candidate) => candidate.name === name);
  const sizeBytes = Number(file?.metadata?.size);
  const mime = String(file?.metadata?.mimetype ?? "");
  return Number.isFinite(sizeBytes) && sizeBytes > 0 ? { sizeBytes, mime } : null;
}

/** True when a stored captions file starts with the WebVTT signature. */
export async function isWebVttFile(path: string): Promise<boolean> {
  const { data, error } = await getBucket().download(path);
  if (error || !data) return false;
  const start = await data.slice(0, CAPTIONS_PEEK_BYTES).text();
  return CAPTIONS_SIGNATURE.test(start);
}

export async function removeHomeworkFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await getBucket().remove(paths);
  if (error) throw new HomeworkStorageError("Could not remove Homework files", { path: paths.join(", "), cause: error });
}

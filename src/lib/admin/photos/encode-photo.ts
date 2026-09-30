import type { EncodeReply, EncodedVariant } from "@/workers/photo-encoder";
import { ACCEPTED_SOURCE_TYPES, MAX_SOURCE_BYTES, PHOTO_FORMATS, PHOTO_WIDTHS } from "@/lib/admin/photos/photo-files";
import type { BrowserProblemCode } from "@/lib/observability/client-problem";

// Browser side of the photo pipeline (Phase 3 plan, decision 5): decode with the camera's
// orientation, then resize and encode AVIF + WebP in a worker. Re-encoding drops camera
// location data.

// Built separately by scripts/build-photo-encoder.mjs.
const PHOTO_ENCODER_URL = "/photo-encoder/photo-encoder.js";

export type PhotoProblemCode = Extract<BrowserProblemCode, "file_rejected" | "decode_error" | "worker_error">;

/** detail: what the browser or the worker said, kept for the problem record (never shown). */
export class PhotoProblemError extends Error {
  constructor(message: string, readonly context: { fileName: string; code: PhotoProblemCode; detail: string | null }) {
    super(message);
    this.name = "PhotoProblemError";
  }
}

export type EncodedPhoto = { width: number; height: number; variants: EncodedVariant[] };

function getErrorDetail(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function checkFile(file: File): void {
  const context = { fileName: file.name, code: "file_rejected" as const };
  if (!ACCEPTED_SOURCE_TYPES.includes(file.type)) throw new PhotoProblemError("Use a JPEG, PNG, or WebP photo.", { ...context, detail: `type ${file.type || "unknown"}` });
  if (file.size > MAX_SOURCE_BYTES) throw new PhotoProblemError("That photo is over 40 MB. Choose a smaller one.", { ...context, detail: `${file.size} bytes` });
}

async function getBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (error) {
    throw new PhotoProblemError("This browser can't open that photo. Save it as a JPEG and try again.", { fileName: file.name, code: "decode_error", detail: `${file.type}: ${getErrorDetail(error)}` });
  }
}

function runWorker(bitmap: ImageBitmap, onProgress: (share: number) => void): Promise<EncodedVariant[]> {
  const worker = new Worker(PHOTO_ENCODER_URL, { type: "module" });
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<EncodeReply>) => {
      const reply = event.data;
      if (reply.type === "progress") onProgress(reply.done / reply.total);
      if (reply.type === "done") resolve(reply.variants);
      if (reply.type === "error") reject(new PhotoProblemError("The photo couldn't be prepared. Try a different photo.", { fileName: "", code: "worker_error", detail: reply.message }));
      if (reply.type !== "progress") worker.terminate();
    };
    worker.onerror = (event: ErrorEvent) => {
      worker.terminate();
      reject(new PhotoProblemError("The photo couldn't be prepared. Try a different browser.", { fileName: "", code: "worker_error", detail: event.message || "The photo worker failed to start" }));
    };
    worker.postMessage({ bitmap, widths: PHOTO_WIDTHS, formats: PHOTO_FORMATS }, [bitmap]);
  });
}

export async function encodePhoto(file: File, onProgress: (share: number) => void): Promise<EncodedPhoto> {
  checkFile(file);
  const bitmap = await getBitmap(file);
  const { width, height } = bitmap;
  return { width, height, variants: await runWorker(bitmap, onProgress) };
}

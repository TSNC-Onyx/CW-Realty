import type { EncodeReply, EncodedVariant } from "@/workers/photo-encoder";
import { ACCEPTED_SOURCE_TYPES, MAX_SOURCE_BYTES, PHOTO_FORMATS, PHOTO_WIDTHS } from "@/lib/admin/photos/photo-files";

// Browser side of the photo pipeline (Phase 3 plan, decision 5): decode with the camera's
// orientation, then resize and encode AVIF + WebP in a worker. Re-encoding drops camera
// location data.

// Built separately by scripts/build-photo-encoder.mjs.
const PHOTO_ENCODER_URL = "/photo-encoder/photo-encoder.js";

export class PhotoProblemError extends Error {
  constructor(message: string, readonly context: { fileName: string }) {
    super(message);
    this.name = "PhotoProblemError";
  }
}

export type EncodedPhoto = { width: number; height: number; variants: EncodedVariant[] };

function checkFile(file: File): void {
  if (!ACCEPTED_SOURCE_TYPES.includes(file.type)) throw new PhotoProblemError("Use a JPEG, PNG, or WebP photo.", { fileName: file.name });
  if (file.size > MAX_SOURCE_BYTES) throw new PhotoProblemError("That photo is over 40 MB. Choose a smaller one.", { fileName: file.name });
}

async function getBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoProblemError("This browser can't open that photo. Save it as a JPEG and try again.", { fileName: file.name });
  }
}

function runWorker(bitmap: ImageBitmap, onProgress: (share: number) => void): Promise<EncodedVariant[]> {
  const worker = new Worker(PHOTO_ENCODER_URL, { type: "module" });
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<EncodeReply>) => {
      const reply = event.data;
      if (reply.type === "progress") onProgress(reply.done / reply.total);
      if (reply.type === "done") resolve(reply.variants);
      if (reply.type === "error") reject(new PhotoProblemError("The photo couldn't be prepared. Try a different photo.", { fileName: "" }));
      if (reply.type !== "progress") worker.terminate();
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new PhotoProblemError("The photo couldn't be prepared. Try a different browser.", { fileName: "" }));
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

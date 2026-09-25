import photoLayout from "@/lib/content/photo-layout.json";

// The photo file layout contract (docs/cwr-phase-2-data-pages-plan.md), shared by the
// browser encoder, the upload server actions, and the site.

export type PhotoFormat = "avif" | "webp";

export const PHOTO_BUCKET = photoLayout.bucket;
export const PHOTO_WIDTHS: number[] = photoLayout.widths;
export const PHOTO_FORMATS = photoLayout.formats as PhotoFormat[];
export const PHOTO_CONTENT_TYPES: Record<PhotoFormat, string> = { avif: "image/avif", webp: "image/webp" };

// What editors may pick. HEIC decodes only where the browser supports it (Safari).
export const ACCEPTED_SOURCE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif"];
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
export const MAX_ALT_TEXT_LENGTH = 250;

export type PhotoVariantName = { width: number; format: PhotoFormat };

export function getPhotoVariantNames(): PhotoVariantName[] {
  return PHOTO_WIDTHS.flatMap((width) => PHOTO_FORMATS.map((format) => ({ width, format })));
}

export function getVariantFileName({ width, format }: PhotoVariantName): string {
  return `${width}.${format}`;
}

/** Actual pixel width of a variant: the named width, but never wider than the original. */
export function getVariantPixelWidth(namedWidth: number, originalWidth: number): number {
  return Math.min(namedWidth, originalWidth);
}

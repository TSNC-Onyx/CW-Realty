import photoLayout from "@/lib/content/photo-layout.json";

// Builds <picture> sources for a photo folder in the public cwr-media bucket.
// Widths larger than the original were saved at the original size, so the srcset
// lists each real width once (docs/cwr-phase-2-data-pages-plan.md, photo layout).

const FALLBACK_WIDTH = 1280;

export type StoredPhoto = { folder: string; originalWidth: number };

export type PhotoSources = { avifSrcSet: string; webpSrcSet: string; fallbackSrc: string };

type Variant = { fileWidth: number; actualWidth: number };

function getVariants(originalWidth: number): Variant[] {
  const variants = photoLayout.widths.map((fileWidth) => ({ fileWidth, actualWidth: Math.min(fileWidth, originalWidth) }));
  return variants.filter((variant, index) => variants.findIndex((other) => other.actualWidth === variant.actualWidth) === index);
}

function getFileUrl({ baseUrl, folder, fileWidth, format }: { baseUrl: string; folder: string; fileWidth: number; format: string }) {
  return `${baseUrl}/storage/v1/object/public/${photoLayout.bucket}/${folder}/${fileWidth}.${format}`;
}

function getSrcSet({ baseUrl, folder, variants, format }: { baseUrl: string; folder: string; variants: Variant[]; format: string }) {
  return variants.map(({ fileWidth, actualWidth }) => `${getFileUrl({ baseUrl, folder, fileWidth, format })} ${actualWidth}w`).join(", ");
}

/** Null when the site runs without database settings, so callers show a placeholder. */
export function getPhotoSources({ folder, originalWidth }: StoredPhoto): PhotoSources | null {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return null;
  const variants = getVariants(originalWidth);
  return {
    avifSrcSet: getSrcSet({ baseUrl, folder, variants, format: "avif" }),
    webpSrcSet: getSrcSet({ baseUrl, folder, variants, format: "webp" }),
    fallbackSrc: getFileUrl({ baseUrl, folder, fileWidth: FALLBACK_WIDTH, format: "webp" }),
  };
}

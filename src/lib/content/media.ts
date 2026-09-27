import photoLayout from "@/lib/content/photo-layout.json";

// Builds <picture> sources for a photo folder: uploaded photos live in the public cwr-media
// bucket, fixed-page photos in public/images/site (scripts/build-site-photos.mjs). Both use
// the same layout. Widths larger than the original were saved at the original size, so the
// srcset lists each real width once (docs/cwr-phase-2-data-pages-plan.md, photo layout).

const FALLBACK_WIDTH = 1280;
const SITE_PHOTO_PATH = "/images/site";

export type StoredPhoto = { folder: string; originalWidth: number };

export type PhotoSources = { avifSrcSet: string; webpSrcSet: string; fallbackSrc: string };

type Variant = { fileWidth: number; actualWidth: number };

function getVariants(originalWidth: number): Variant[] {
  const variants = photoLayout.widths.map((fileWidth) => ({ fileWidth, actualWidth: Math.min(fileWidth, originalWidth) }));
  return variants.filter((variant, index) => variants.findIndex((other) => other.actualWidth === variant.actualWidth) === index);
}

function getSrcSet({ folderUrl, variants, format }: { folderUrl: string; variants: Variant[]; format: string }) {
  return variants.map(({ fileWidth, actualWidth }) => `${folderUrl}/${fileWidth}.${format} ${actualWidth}w`).join(", ");
}

function getSources({ folderUrl, originalWidth }: { folderUrl: string; originalWidth: number }): PhotoSources {
  const variants = getVariants(originalWidth);
  return {
    avifSrcSet: getSrcSet({ folderUrl, variants, format: "avif" }),
    webpSrcSet: getSrcSet({ folderUrl, variants, format: "webp" }),
    fallbackSrc: `${folderUrl}/${FALLBACK_WIDTH}.webp`,
  };
}

/** Null when the site runs without database settings, so callers show a placeholder. */
export function getPhotoSources({ folder, originalWidth }: StoredPhoto): PhotoSources | null {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return null;
  return getSources({ folderUrl: `${baseUrl}/storage/v1/object/public/${photoLayout.bucket}/${folder}`, originalWidth });
}

/** Sources for a fixed-page photo served by this site. */
export function getSitePhotoSources({ folder, originalWidth }: StoredPhoto): PhotoSources {
  return getSources({ folderUrl: `${SITE_PHOTO_PATH}/${folder}`, originalWidth });
}

import sitePhotoManifest from "@/lib/content/site-photos.json";

// Fixed-page photos (stock and brand) saved by scripts/build-site-photos.mjs.

export type SitePhotoName = keyof typeof sitePhotoManifest.photos;

export type SitePhoto = { folder: SitePhotoName; alt: string; width: number; height: number };

export function getSitePhoto(name: SitePhotoName): SitePhoto {
  const { alt, width, height } = sitePhotoManifest.photos[name];
  return { folder: name, alt, width, height };
}

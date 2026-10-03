import { PhotoPlaceholder, type PhotoRatio } from "@/components/ui/photo-placeholder";
import { getPhotoSources, getSitePhotoSources, type PhotoSources } from "@/lib/content/media";
import type { SitePhoto } from "@/lib/content/site-photos";

// Style §11.8: AVIF with WebP fallback, space reserved by the container ratio,
// photo-placeholder background until the file loads, lazy unless it is the main photo.
// A plain <img> is used because next/image writes inline styles the strict CSP blocks.

const RATIO_CLASSES: Record<PhotoRatio, string> = {
  hero: "aspect-hero-mobile md:aspect-hero",
  photo: "aspect-photo",
  portrait: "aspect-portrait",
};

const FIT_CLASSES = { cover: "object-cover", contain: "object-contain" } as const;

type PhotoFile = { alt: string; width: number; height: number };

/** cover fills the frame (cropping); contain shows the whole photo (the full-screen viewer). */
export type PhotoFit = keyof typeof FIT_CLASSES;

type PictureProps = {
  photo: PhotoFile;
  sources: PhotoSources;
  sizes: string;
  isPriority: boolean;
  frameClassName: string;
  imageClassName: string;
  fit?: PhotoFit;
  onError?: () => void;
};

function Picture({ photo, sources, sizes, isPriority, frameClassName, imageClassName, fit = "cover", onError }: PictureProps) {
  return (
    <picture className={`block overflow-hidden bg-photo-placeholder ${frameClassName}`}>
      <source type="image/avif" srcSet={sources.avifSrcSet} sizes={sizes} />
      <img
        src={sources.fallbackSrc}
        srcSet={sources.webpSrcSet}
        sizes={sizes}
        alt={photo.alt}
        width={photo.width}
        height={photo.height}
        loading={isPriority ? "eager" : "lazy"}
        fetchPriority={isPriority ? "high" : "auto"}
        decoding="async"
        onError={onError}
        className={`size-full ${FIT_CLASSES[fit]} ${imageClassName}`}
      />
    </picture>
  );
}

export type ResponsivePhotoProps = {
  photo: { folder: string; alt: string; width: number; height: number } | null;
  ratio: PhotoRatio;
  sizes: string;
  isPriority?: boolean;
  imageClassName?: string;
  /** Replaces the ratio when the frame sets its own size (the full-screen viewer). */
  frameClassName?: string;
  fit?: PhotoFit;
  /** The file didn't load (missing or blocked); the caller shows the placeholder instead. */
  onError?: () => void;
};

export function ResponsivePhoto({ photo, ratio, sizes, isPriority = false, imageClassName = "", frameClassName, fit, onError }: ResponsivePhotoProps) {
  const sources = photo ? getPhotoSources({ folder: photo.folder, originalWidth: photo.width }) : null;
  if (!photo || !sources) return <PhotoPlaceholder ratio={ratio} />;
  return (
    <Picture
      photo={photo}
      sources={sources}
      sizes={sizes}
      isPriority={isPriority}
      frameClassName={frameClassName ?? RATIO_CLASSES[ratio]}
      imageClassName={imageClassName}
      fit={fit}
      onError={onError}
    />
  );
}

export type SitePhotoImageProps = {
  photo: SitePhoto;
  sizes: string;
  ratio?: PhotoRatio;
  isPriority?: boolean;
  frameClassName?: string;
};

/** A fixed-page photo this site serves; `frameClassName` replaces the ratio when the frame sets its own size. */
export function SitePhotoImage({ photo, sizes, ratio = "photo", isPriority = false, frameClassName }: SitePhotoImageProps) {
  const sources = getSitePhotoSources({ folder: photo.folder, originalWidth: photo.width });
  return (
    <Picture
      photo={photo}
      sources={sources}
      sizes={sizes}
      isPriority={isPriority}
      frameClassName={frameClassName ?? RATIO_CLASSES[ratio]}
      imageClassName=""
    />
  );
}

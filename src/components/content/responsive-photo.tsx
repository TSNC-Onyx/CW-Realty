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

type PhotoFile = { alt: string; width: number; height: number };

type PictureProps = {
  photo: PhotoFile;
  sources: PhotoSources;
  sizes: string;
  isPriority: boolean;
  frameClassName: string;
  imageClassName: string;
};

function Picture({ photo, sources, sizes, isPriority, frameClassName, imageClassName }: PictureProps) {
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
        className={`size-full object-cover ${imageClassName}`}
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
};

export function ResponsivePhoto({ photo, ratio, sizes, isPriority = false, imageClassName = "" }: ResponsivePhotoProps) {
  const sources = photo ? getPhotoSources({ folder: photo.folder, originalWidth: photo.width }) : null;
  if (!photo || !sources) return <PhotoPlaceholder ratio={ratio} />;
  return (
    <Picture
      photo={photo}
      sources={sources}
      sizes={sizes}
      isPriority={isPriority}
      frameClassName={RATIO_CLASSES[ratio]}
      imageClassName={imageClassName}
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

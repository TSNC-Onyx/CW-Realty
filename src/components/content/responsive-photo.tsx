import { PhotoPlaceholder, type PhotoRatio } from "@/components/ui/photo-placeholder";
import { getPhotoSources } from "@/lib/content/media";

// Style §11.8: AVIF with WebP fallback, space reserved by the container ratio,
// photo-placeholder background until the file loads, lazy unless it is the main photo.
// A plain <img> is used because next/image writes inline styles the strict CSP blocks.

const RATIO_CLASSES: Record<PhotoRatio, string> = {
  hero: "aspect-hero-mobile md:aspect-hero",
  photo: "aspect-photo",
  portrait: "aspect-portrait",
};

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
    <picture className={`block overflow-hidden bg-photo-placeholder ${RATIO_CLASSES[ratio]}`}>
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

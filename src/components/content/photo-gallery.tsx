"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { PhotoViewer } from "@/components/content/photo-viewer";
import { ResponsivePhoto } from "@/components/content/responsive-photo";
import { getClampedIndex, usePhotoTrack } from "@/components/content/use-photo-track";
import { PhotoPlaceholder } from "@/components/ui/photo-placeholder";
import type { ListingPhoto } from "@/lib/content/listings";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { isBrowserOffline } from "@/lib/observability/browser-offline";
import { reportVisitorClientProblem } from "@/lib/observability/report-client-problem";

// Listing photo gallery (docs/cwr-reliability-round-plan.md §3.1; owner decision D2), following
// the W3C carousel pattern: swipe the big photo, or use the ‹ › buttons, the thumbnails, or
// the arrow keys; "3 of 8" shows where you are, and tapping the photo opens it full screen.
// Nothing moves on its own. Photo 1 loads first; the rest load as they come into view. A photo
// that fails to load shows the placeholder and is recorded once.

const THUMBNAIL_SIZES = "72px";

type PhotoGalleryProps = {
  photos: ListingPhoto[];
  /** What the photos show, for screen readers (the street address). */
  label: string;
  sizes: string;
  /** Laid over the big photo (the listing's status tag). */
  overlay?: ReactNode;
};

/** The admin's alt text, or "Photo 3 of 8, <address>" if a draft has none. */
function getAltText({ photo, index, count, label }: { photo: ListingPhoto; index: number; count: number; label: string }): string {
  return photo.alt.trim() || `Photo ${index + 1} of ${count}, ${label}`;
}

function GalleryArrow({ direction, isDisabled, onPress }: { direction: "previous" | "next"; isDisabled: boolean; onPress: () => void }) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  return (
    <button type="button" aria-label={direction === "previous" ? "Previous photo" : "Next photo"} aria-disabled={isDisabled} onClick={isDisabled ? undefined : onPress} className="flex size-12 items-center justify-center border border-line bg-page aria-disabled:opacity-40">
      <Icon aria-hidden size={ICON_SIZE.message} />
    </button>
  );
}

type PositionProps = { index: number; onGoTo: (index: number) => void };

function GalleryControls({ index, count, onGoTo }: PositionProps & { count: number }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-4">
      <GalleryArrow direction="previous" isDisabled={index === 0} onPress={() => onGoTo(index - 1)} />
      <p className="text-base tabular-nums">{`${index + 1} of ${count}`}</p>
      <GalleryArrow direction="next" isDisabled={index === count - 1} onPress={() => onGoTo(index + 1)} />
    </div>
  );
}

function GalleryThumbnails({ photos, index: currentIndex, onGoTo }: PositionProps & { photos: ListingPhoto[] }) {
  return (
    <div className="photo-thumbs mt-3">
      {photos.map((photo, index) => (
        <button key={photo.folder} type="button" aria-label={`Show photo ${index + 1} of ${photos.length}`} aria-current={index === currentIndex} onClick={() => onGoTo(index)} className="photo-thumb">
          <ResponsivePhoto photo={photo} ratio="photo" sizes={THUMBNAIL_SIZES} frameClassName="size-full" />
        </button>
      ))}
    </div>
  );
}

type SlideProps = { photo: ListingPhoto; index: number; count: number; label: string; sizes: string; isCurrent: boolean; hasFailed: boolean; onOpen: () => void; onError: () => void; buttonRef: (button: HTMLButtonElement | null) => void };

function GallerySlide({ photo, index, count, label, sizes, isCurrent, hasFailed, onOpen, onError, buttonRef }: SlideProps) {
  const alt = getAltText({ photo, index, count, label });
  return (
    <div role={count > 1 ? "group" : undefined} aria-roledescription={count > 1 ? "slide" : undefined} aria-label={count > 1 ? `${index + 1} of ${count}` : undefined} className="photo-slide">
      <button ref={buttonRef} type="button" aria-label={count > 1 ? `${alt}, photo ${index + 1} of ${count}, open full screen` : `${alt}, open full screen`} tabIndex={isCurrent ? 0 : -1} onClick={onOpen} className="block w-full cursor-zoom-in">
        {hasFailed ? (
          <span role="img" aria-label={alt} className="block">
            <PhotoPlaceholder ratio="photo" />
          </span>
        ) : (
          <ResponsivePhoto photo={{ ...photo, alt }} ratio="photo" sizes={sizes} isPriority={index === 0} onError={onError} />
        )}
      </button>
    </div>
  );
}

export function PhotoGallery({ photos, label, sizes, overlay }: PhotoGalleryProps) {
  const count = photos.length;
  const { trackRef, index: currentIndex, goTo, jumpTo, handleScroll, handleScrollEnd, handleUserScrollStart } = usePhotoTrack(count);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [failedFolders, setFailedFolders] = useState<ReadonlySet<string>>(new Set());
  const [hasMoved, setHasMoved] = useState(false);
  const slideButtonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  if (count === 0) {
    return (
      <div className="relative">
        {overlay}
        <PhotoPlaceholder ratio="photo" />
      </div>
    );
  }

  const handleImageError = (folder: string) => {
    if (failedFolders.has(folder)) return;
    setFailedFolders(new Set([...failedFolders, folder]));
    // A visitor's own lost connection isn't a missing photo (docs/false-alarm-cleanup-plan.md #9).
    if (isBrowserOffline()) return;
    void reportVisitorClientProblem({ action: "site.listing_photo", stage: "browser", severity: "warning", code: "image_failed" });
  };

  // Arrow keys move one photo; if focus was on a photo it follows, so it never sits on a hidden one.
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (count < 2 || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    const target = getClampedIndex({ index: currentIndex + (event.key === "ArrowRight" ? 1 : -1), count });
    const wasOnPhoto = slideButtonsRef.current.includes(document.activeElement as HTMLButtonElement);
    goTo(target);
    setHasMoved(true);
    if (wasOnPhoto) slideButtonsRef.current[target]?.focus({ preventScroll: true });
  };

  const handleViewerClose = (lastIndex: number) => {
    setViewerIndex(null);
    jumpTo(lastIndex);
    slideButtonsRef.current[lastIndex]?.focus({ preventScroll: true });
  };

  return (
    <>
      <section aria-roledescription={count > 1 ? "carousel" : undefined} aria-label={`Photos of ${label}`} onKeyDown={handleKeyDown} onClickCapture={() => setHasMoved(true)} className="min-w-0">
        <div className="relative">
          {overlay}
          <div ref={trackRef} onScroll={handleScroll} onScrollEnd={handleScrollEnd} onPointerDown={handleUserScrollStart} onWheel={handleUserScrollStart} className="photo-track">
            {photos.map((photo, index) => (
              <GallerySlide
                key={photo.folder}
                photo={photo}
                index={index}
                count={count}
                label={label}
                sizes={sizes}
                isCurrent={index === currentIndex}
                hasFailed={failedFolders.has(photo.folder)}
                onOpen={() => setViewerIndex(index)}
                onError={() => handleImageError(photo.folder)}
                buttonRef={(button) => {
                  slideButtonsRef.current[index] = button;
                }}
              />
            ))}
          </div>
        </div>
        {count > 1 && <GalleryControls index={currentIndex} count={count} onGoTo={goTo} />}
        {count > 1 && <GalleryThumbnails photos={photos} index={currentIndex} onGoTo={goTo} />}
        <p aria-live="polite" className="sr-only">
          {hasMoved && count > 1 ? `Photo ${currentIndex + 1} of ${count}` : ""}
        </p>
      </section>
      <PhotoViewer photos={photos} label={label} openIndex={viewerIndex} onClose={handleViewerClose} />
    </>
  );
}

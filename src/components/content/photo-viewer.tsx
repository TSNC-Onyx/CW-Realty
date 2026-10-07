"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useEffectEvent, useRef, type KeyboardEvent, type SyntheticEvent } from "react";

import { ResponsivePhoto } from "@/components/content/responsive-photo";
import { usePhotoTrack } from "@/components/content/use-photo-track";
import type { ListingPhoto } from "@/lib/content/listings";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Full-screen photo viewer (docs/cwr-reliability-round-plan.md §3.2): a native modal dialog
// (focus stays inside, Esc closes, the page behind is inert), photos shown whole at full size,
// with the same swipe, buttons and arrow keys as the gallery.
//
// Back button: opening adds one history step, so a phone's Back closes the viewer instead of
// leaving the listing. Esc and Close go through that same step, and only the popstate
// handler actually closes it, so the three can't race. A reload while it was open starts closed.
// The dialog's own close event is the one place the gallery is told, so a close the browser
// forces by itself is handled too (and its history step removed).

const VIEWER_SIZES = "100vw";
const HISTORY_STATE = { cwrPhotoViewer: true } as const;

type PhotoViewerProps = {
  photos: ListingPhoto[];
  label: string;
  /** The photo to open on, or null while closed. */
  openIndex: number | null;
  /** Closed; lastIndex is the photo it was showing, for the gallery to follow. */
  onClose: (lastIndex: number) => void;
};

function isViewerHistoryStep(): boolean {
  return (window.history.state as { cwrPhotoViewer?: boolean } | null)?.cwrPhotoViewer === true;
}

function ViewerArrow({ direction, isDisabled, onPress }: { direction: "previous" | "next"; isDisabled: boolean; onPress: () => void }) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  return (
    <button type="button" aria-label={direction === "previous" ? "Previous photo" : "Next photo"} aria-disabled={isDisabled} onClick={isDisabled ? undefined : onPress} className="flex size-12 items-center justify-center aria-disabled:opacity-40">
      <Icon aria-hidden size={ICON_SIZE.message} />
    </button>
  );
}

export function PhotoViewer({ photos, label, openIndex, onClose }: PhotoViewerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { trackRef, index: currentIndex, goTo, jumpTo, handleScroll, handleScrollEnd, handleUserScrollStart } = usePhotoTrack(photos.length);
  const isOpen = openIndex !== null;
  const count = photos.length;

  const closeNow = () => {
    if (dialogRef.current?.open) dialogRef.current.close();
  };

  const handleDialogClose = () => {
    if (isViewerHistoryStep()) window.history.back();
    onClose(currentIndex);
  };

  const requestClose = () => {
    if (isViewerHistoryStep()) window.history.back();
    else closeNow();
  };

  const handleOpen = useEffectEvent((index: number) => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    window.history.pushState(HISTORY_STATE, "");
    jumpTo(index);
    closeButtonRef.current?.focus();
  });
  const handlePopState = useEffectEvent(() => {
    if (dialogRef.current?.open && !isViewerHistoryStep()) closeNow();
  });

  useEffect(() => {
    if (openIndex !== null) handleOpen(openIndex);
  }, [openIndex]);

  useEffect(() => {
    if (isViewerHistoryStep()) window.history.replaceState(null, "");
    const listener = () => handlePopState();
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    requestClose();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    goTo(currentIndex + (event.key === "ArrowRight" ? 1 : -1));
  };

  return (
    <dialog ref={dialogRef} aria-label={`Photos of ${label}, full screen`} onCancel={handleCancel} onClose={handleDialogClose} onKeyDown={handleKeyDown} className="photo-viewer tone-dark m-0 border-0 p-0">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <p className="text-base tabular-nums" aria-live="polite">
            {count > 1 ? `${currentIndex + 1} of ${count}` : ""}
          </p>
          <button ref={closeButtonRef} type="button" onClick={requestClose} aria-label="Close full-screen photos" className="flex size-12 items-center justify-center">
            <X aria-hidden size={ICON_SIZE.message} />
          </button>
        </div>
        {/* Focusable so keyboard users can scroll it in every browser (axe scrollable-region-focusable). */}
        <div ref={trackRef} role="group" aria-label="Photos" tabIndex={0} onScroll={handleScroll} onScrollEnd={handleScrollEnd} onPointerDown={handleUserScrollStart} onWheel={handleUserScrollStart} className="photo-track">
          {photos.map((photo, index) => (
            <div key={photo.folder} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${count}`} className="photo-slide">
              {isOpen && <ResponsivePhoto photo={photo} ratio="photo" sizes={VIEWER_SIZES} frameClassName="size-full bg-dark!" fit="contain" />}
            </div>
          ))}
        </div>
        {count > 1 && (
          <div className="flex items-center justify-center gap-6 px-4 py-2">
            <ViewerArrow direction="previous" isDisabled={currentIndex === 0} onPress={() => goTo(currentIndex - 1)} />
            <ViewerArrow direction="next" isDisabled={currentIndex === count - 1} onPress={() => goTo(currentIndex + 1)} />
          </div>
        )}
      </div>
    </dialog>
  );
}

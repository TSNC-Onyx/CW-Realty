"use client";

import { useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";

// Which photo a scroll-snap track is showing, and moving between photos
// (docs/cwr-reliability-round-plan.md §3.1). The current photo is always read back from the
// scroll position, so a swipe, a trackpad, a button, a key or a phone rotation all agree.
// While a button-started glide is under way, the photo it is heading to counts as current,
// so a quick second tap moves on from there. Reduced motion jumps instead of sliding.

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export type PhotoTrack = {
  trackRef: RefObject<HTMLDivElement | null>;
  index: number;
  goTo: (index: number) => void;
  /** Jumps without animation (opening the viewer on a chosen photo). */
  jumpTo: (index: number) => void;
  handleScroll: () => void;
  /** The scroll came to rest (the glide finished, or a swipe interrupted it). */
  handleScrollEnd: () => void;
  /** A finger, mouse or wheel took over: follow the scroll position again (browsers without scrollend). */
  handleUserScrollStart: () => void;
};

export function getClampedIndex({ index, count }: { index: number; count: number }): number {
  return Math.min(Math.max(index, 0), Math.max(count - 1, 0));
}

export function getIndexFromScroll({ scrollLeft, slideWidth, count }: { scrollLeft: number; slideWidth: number; count: number }): number {
  if (slideWidth <= 0) return 0;
  return getClampedIndex({ index: Math.round(scrollLeft / slideWidth), count });
}

function isReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function usePhotoTrack(count: number): PhotoTrack {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const frameRef = useRef<number | null>(null);
  const glideTargetRef = useRef<number | null>(null);

  const getScrolledIndex = (): number | null => {
    const track = trackRef.current;
    return track ? getIndexFromScroll({ scrollLeft: track.scrollLeft, slideWidth: track.clientWidth, count }) : null;
  };

  const scrollToIndex = ({ target, behavior }: { target: number; behavior: ScrollBehavior }) => {
    const track = trackRef.current;
    const next = getClampedIndex({ index: target, count });
    glideTargetRef.current = behavior === "smooth" ? next : null;
    track?.scrollTo({ left: next * track.clientWidth, behavior });
    setIndex(next);
  };

  const goTo = (target: number) => scrollToIndex({ target, behavior: isReducedMotion() ? "instant" : "smooth" });
  const jumpTo = (target: number) => scrollToIndex({ target, behavior: "instant" });

  const handleScroll = () => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const scrolledIndex = getScrolledIndex();
      if (scrolledIndex === null || (glideTargetRef.current !== null && scrolledIndex !== glideTargetRef.current)) return;
      glideTargetRef.current = null;
      setIndex(scrolledIndex);
    });
  };

  const handleUserScrollStart = () => {
    glideTargetRef.current = null;
  };

  const handleScrollEnd = () => {
    glideTargetRef.current = null;
    const scrolledIndex = getScrolledIndex();
    if (scrolledIndex !== null) setIndex(scrolledIndex);
  };

  // A resize or phone rotation changes the slide width: keep the same photo in view.
  const handleResize = useEffectEvent(() => jumpTo(index));

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new ResizeObserver(() => handleResize());
    observer.observe(track);
    return () => {
      observer.disconnect();
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return { trackRef, index, goTo, jumpTo, handleScroll, handleScrollEnd, handleUserScrollStart };
}

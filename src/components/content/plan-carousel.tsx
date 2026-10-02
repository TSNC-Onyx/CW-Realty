"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";

import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Plans for one audience (docs/cwr-selected-services-plan.md). Below 1024px a carousel: a plan
// list (links that work without JavaScript), centered cards with native scroll snap, and arrows
// fixed at the middle of the cards' edges (owner choice 2026-10-02). From 1024px the same cards
// form the plan grid (globals.css .plan-track), and the carousel roles and controls step aside.
// Pattern: W3C WAI-ARIA APG Carousel — labelled buttons that keep focus, a polite live region
// that speaks only after the visitor moves the carousel.

const CAROUSEL_QUERY = "(width < 1024px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
// Space left between the sticky header and a plan brought into view from the plan list.
const PLAN_TOP_GAP = 16;
// A scroll counts as finished after this long without another scroll event.
const SCROLL_SETTLE_MS = 150;
const USER_SCROLL_EVENTS = ["pointerdown", "wheel", "keydown"] as const;

export type CarouselPlan = { slug: string; name: string; listPrice: string; isRecommended: boolean; isWide: boolean };

type PlanCarouselProps = { sectionId: string; label: string; plans: CarouselPlan[]; cards: ReactNode[] };

type CarouselRefs = { trackRef: RefObject<HTMLDivElement | null>; slideRefs: RefObject<(HTMLDivElement | null)[]> };

type PlanPosition = { current: number; announcement: string; moveTo: (index: number) => void; moveBy: (step: number) => void };

function getScrollBehavior(): ScrollBehavior {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches ? "auto" : "smooth";
}

function getCenteredLeft(track: HTMLElement, slide: HTMLElement): number {
  return slide.offsetLeft - track.offsetLeft + slide.offsetWidth / 2 - track.clientWidth / 2;
}

/** The plan whose card is nearest the middle of the track. */
function getIndexFromScroll(track: HTMLElement, slides: (HTMLElement | null)[]): number {
  const distances = slides.map((slide) => (slide ? Math.abs(getCenteredLeft(track, slide) - track.scrollLeft) : Infinity));
  return distances.indexOf(Math.min(...distances));
}

function getAnnouncement(plans: CarouselPlan[], index: number): string {
  return `Showing plan ${index + 1} of ${plans.length}: ${plans[index]?.name ?? ""}`;
}

function scrollPageToSlide(slide: HTMLElement): void {
  const headerHeight = document.querySelector("header")?.offsetHeight ?? 0;
  const top = slide.getBoundingClientRect().top + window.scrollY - headerHeight - PLAN_TOP_GAP;
  window.scrollTo({ top, behavior: getScrollBehavior() });
}

function useIsCarousel(): boolean {
  const [isCarousel, setIsCarousel] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(CAROUSEL_QUERY);
    const handleChange = () => setIsCarousel(query.matches);
    handleChange();
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);
  return isCarousel;
}

/** Opens on the recommended plan (Baymard: most visitors never reach later slides). */
function centerRecommendedPlan({ track, slides, plans }: { track: HTMLElement; slides: (HTMLElement | null)[]; plans: CarouselPlan[] }): void {
  const recommended = slides[plans.findIndex((plan) => plan.isRecommended)];
  if (recommended) track.scrollTo({ left: getCenteredLeft(track, recommended), behavior: "instant" });
}

type TrackListeners = { track: HTMLElement; onScroll: () => void; onSettle: () => void; onUserMove: () => void };

/** Follows the track's scroll once per frame, reports when it settles, and notes the visitor's own moves. Returns the cleanup. */
function subscribeToTrackScroll({ track, onScroll, onSettle, onUserMove }: TrackListeners): () => void {
  let frame = 0;
  let timer = 0;
  const handleScroll = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(onSettle, SCROLL_SETTLE_MS);
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      onScroll();
    });
  };
  track.addEventListener("scroll", handleScroll, { passive: true });
  USER_SCROLL_EVENTS.forEach((name) => track.addEventListener(name, onUserMove, { passive: true }));
  return () => {
    window.clearTimeout(timer);
    cancelAnimationFrame(frame);
    track.removeEventListener("scroll", handleScroll);
    USER_SCROLL_EVENTS.forEach((name) => track.removeEventListener(name, onUserMove));
  };
}

// Tracks which plan is in the middle. The list and arrows follow the scroll as it happens; the
// target (used by the arrows, so quick presses don't skip a plan) and the spoken announcement
// update when the scroll settles, and only speak once the visitor has moved the carousel.
function usePlanPosition({ trackRef, slideRefs, plans, isCarousel }: CarouselRefs & { plans: CarouselPlan[]; isCarousel: boolean }): PlanPosition {
  const [current, setCurrent] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const targetRef = useRef(0);
  const hasUserMovedRef = useRef(false);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !isCarousel) return;
    // Starting (or returning from desktop width) is not a visitor move, so nothing is spoken.
    hasUserMovedRef.current = false;
    centerRecommendedPlan({ track, slides: slideRefs.current, plans });
    const getIndex = () => getIndexFromScroll(track, slideRefs.current);
    const handleSettle = () => {
      const index = getIndex();
      targetRef.current = index;
      setCurrent(index);
      if (hasUserMovedRef.current) setAnnouncement(getAnnouncement(plans, index));
    };
    handleSettle();
    return subscribeToTrackScroll({
      track,
      onScroll: () => setCurrent(getIndex()),
      onSettle: handleSettle,
      onUserMove: () => {
        hasUserMovedRef.current = true;
      },
    });
  }, [trackRef, slideRefs, plans, isCarousel]);

  const moveTo = useCallback((index: number) => {
    const track = trackRef.current;
    const target = Math.max(0, Math.min(index, plans.length - 1));
    const slide = slideRefs.current[target];
    if (!track || !slide) return;
    hasUserMovedRef.current = true;
    targetRef.current = target;
    track.scrollTo({ left: getCenteredLeft(track, slide), behavior: getScrollBehavior() });
  }, [trackRef, slideRefs, plans.length]);

  const moveBy = useCallback((step: number) => moveTo(targetRef.current + step), [moveTo]);

  return { current, announcement, moveTo, moveBy };
}

function PlanList({ sectionId, plans, current, isCarousel, onSelect }: { sectionId: string; plans: CarouselPlan[]; current: number; isCarousel: boolean; onSelect: (index: number, event: MouseEvent) => void }) {
  return (
    <div className="plan-list mb-6">
      <p className="type-small mb-2 text-muted">Tap a plan to see it, or swipe the cards.</p>
      <ul className="border-t-2 border-ink">
        {plans.map((plan, index) => (
          <li key={plan.slug}>
            <a
              href={`#${sectionId}-${plan.slug}`}
              aria-current={isCarousel ? index === current : undefined}
              onClick={(event) => onSelect(index, event)}
              className="plan-list-link flex min-h-12 w-full items-center justify-between gap-3 border-b border-l-4 border-line border-l-transparent py-3 pr-1 pl-3 text-base"
            >
              <span>{plan.name}</span>
              <span className="font-bold whitespace-nowrap">{plan.listPrice}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// aria-disabled (not the disabled attribute) keeps keyboard focus on an arrow that reaches the end.
// A press at the very end is a no-op because the move is clamped to the first and last plan.
function PlanArrow({ trackId, label, isAtEnd, onPress, children }: { trackId: string; label: string; isAtEnd: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <div className="plan-arrow-rail">
      <button type="button" className="plan-arrow" aria-label={label} aria-controls={trackId} aria-disabled={isAtEnd} onClick={onPress}>
        {children}
      </button>
    </div>
  );
}

function PlanArrows({ trackId, current, count, isCarousel, onMove }: { trackId: string; current: number; count: number; isCarousel: boolean; onMove: (step: number) => void }) {
  return (
    <div className="plan-arrows" data-pending={isCarousel ? undefined : ""}>
      <PlanArrow trackId={trackId} label="Previous plan" isAtEnd={current === 0} onPress={() => onMove(-1)}>
        <ChevronLeft aria-hidden size={ICON_SIZE.carouselArrow} />
      </PlanArrow>
      <PlanArrow trackId={trackId} label="Next plan" isAtEnd={current === count - 1} onPress={() => onMove(1)}>
        <ChevronRight aria-hidden size={ICON_SIZE.carouselArrow} />
      </PlanArrow>
    </div>
  );
}

export function PlanCarousel({ sectionId, label, plans, cards }: PlanCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isCarousel = useIsCarousel();
  const { current, announcement, moveTo, moveBy } = usePlanPosition({ trackRef, slideRefs, plans, isCarousel });
  const trackId = `${sectionId}-track`;

  // The plan list also brings the chosen plan into view and moves focus to it.
  const handleSelect = (index: number, event: MouseEvent) => {
    const slide = slideRefs.current[index];
    if (!isCarousel || !slide) return;
    event.preventDefault();
    moveTo(index);
    scrollPageToSlide(slide);
    slide.focus({ preventScroll: true });
  };

  // Tabbing into a partly hidden card brings the whole card into view.
  const handleFocus = (index: number) => {
    if (isCarousel) moveTo(index);
  };

  // A group, not a region: the plan section around it is already the landmark with this name.
  return (
    <div role={isCarousel ? "group" : undefined} aria-roledescription={isCarousel ? "carousel" : undefined} aria-label={isCarousel ? label : undefined}>
      <PlanList sectionId={sectionId} plans={plans} current={current} isCarousel={isCarousel} onSelect={handleSelect} />
      <p aria-live="polite" className="sr-only">
        {isCarousel ? announcement : ""}
      </p>
      <div className="plan-stage">
        <div id={trackId} ref={trackRef} className="plan-track">
          {plans.map((plan, index) => (
            <div
              key={plan.slug}
              id={`${sectionId}-${plan.slug}`}
              ref={(slide) => {
                slideRefs.current[index] = slide;
              }}
              className="plan-slide"
              data-wide={plan.isWide ? "" : undefined}
              role={isCarousel ? "group" : undefined}
              aria-roledescription={isCarousel ? "slide" : undefined}
              aria-label={isCarousel ? `${index + 1} of ${plans.length}: ${plan.name}` : undefined}
              tabIndex={isCarousel ? -1 : undefined}
              onFocus={() => handleFocus(index)}
            >
              {cards[index]}
            </div>
          ))}
        </div>
        <PlanArrows trackId={trackId} current={current} count={plans.length} isCarousel={isCarousel} onMove={moveBy} />
      </div>
    </div>
  );
}

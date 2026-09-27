"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Home hero photos that cross-fade every 6 seconds (owner choice 2026-09-26). WCAG 2.2.2:
// anything that changes on its own for more than 5 seconds needs a way to stop it, so an
// icon-only pause/play button (owner choice) sits on the photo. With reduced motion the
// first photo stays put until the visitor presses play.

const SLIDE_INTERVAL_MS = 6000;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const PAUSE_LABEL = "Pause slideshow";
const PLAY_LABEL = "Play slideshow";

type HeroSlideshowProps = { slides: ReactNode[] };

function getNextIndex(index: number, count: number): number {
  return (index + 1) % count;
}

function subscribeToMotionPreference(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getPrefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

// The server cannot know the preference, so the first render starts still.
function getServerPrefersReducedMotion(): boolean {
  return true;
}

export function HeroSlideshow({ slides }: HeroSlideshowProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [visitorChoice, setVisitorChoice] = useState<boolean | null>(null);
  const prefersReducedMotion = useSyncExternalStore(subscribeToMotionPreference, getPrefersReducedMotion, getServerPrefersReducedMotion);
  const isPlaying = visitorChoice ?? !prefersReducedMotion;

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => setActiveIndex((index) => getNextIndex(index, slides.length)), SLIDE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isPlaying, slides.length]);

  const handleToggle = () => setVisitorChoice(!isPlaying);
  const label = isPlaying ? PAUSE_LABEL : PLAY_LABEL;
  const Icon = isPlaying ? Pause : Play;

  return (
    <div className="home-hero-stage">
      {slides.map((slide, index) => (
        <div key={index} className="home-hero-slide" data-active={index === activeIndex} aria-hidden={index !== activeIndex}>
          {slide}
        </div>
      ))}
      <button
        type="button"
        onClick={handleToggle}
        aria-label={label}
        title={label}
        className="absolute top-4 right-4 z-10 flex size-11 cursor-pointer items-center justify-center bg-dark-translucent text-on-dark transition-colors duration-200 [--focus-ring-color:var(--color-on-dark)] hover:bg-dark-translucent-hover lg:top-auto lg:right-6 lg:bottom-6"
      >
        <Icon aria-hidden size={ICON_SIZE.button} />
      </button>
    </div>
  );
}

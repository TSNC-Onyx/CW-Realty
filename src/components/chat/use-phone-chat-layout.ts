"use client";

import { useEffect, useState, type RefObject } from "react";

// Bug 19 (docs/cwr-chatbot-round-3-plan.md): below 1024px the chat covers the whole screen.
// While it is open there it is a modal, and it follows the visual viewport, so the iPhone
// keyboard never hides the question box. The CSS that uses these values is in globals.css.

export const FULL_SCREEN_QUERY = "(width < 1024px)";

const HEIGHT_PROPERTY = "--chat-viewport-height";
const TOP_PROPERTY = "--chat-viewport-top";

/** True while the chat would cover the whole screen (phones and small tablets). */
export function useIsFullScreenChat(): boolean {
  const [isFullScreen, setIsFullScreen] = useState(() => window.matchMedia(FULL_SCREEN_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(FULL_SCREEN_QUERY);
    const handleChange = () => setIsFullScreen(query.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);
  return isFullScreen;
}

function setViewportProperties(panel: HTMLElement, viewport: VisualViewport): void {
  panel.style.setProperty(HEIGHT_PROPERTY, `${viewport.height}px`);
  panel.style.setProperty(TOP_PROPERTY, `${viewport.offsetTop}px`);
}

/** Sizes the open full-screen panel to the visible area above the on-screen keyboard. */
export function useVisualViewportFit({ panelRef, isActive }: { panelRef: RefObject<HTMLElement | null>; isActive: boolean }): void {
  useEffect(() => {
    const panel = panelRef.current;
    const viewport = window.visualViewport;
    if (!isActive || !panel || !viewport) return;
    const handleViewportChange = () => setViewportProperties(panel, viewport);
    handleViewportChange();
    viewport.addEventListener("resize", handleViewportChange);
    viewport.addEventListener("scroll", handleViewportChange);
    return () => {
      viewport.removeEventListener("resize", handleViewportChange);
      viewport.removeEventListener("scroll", handleViewportChange);
      panel.style.removeProperty(HEIGHT_PROPERTY);
      panel.style.removeProperty(TOP_PROPERTY);
    };
  }, [panelRef, isActive]);
}

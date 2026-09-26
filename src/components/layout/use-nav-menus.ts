"use client";

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";

// Style §5 desktop sub-menus (owner choice 2026-09-26): a mouse opens a sub-menu by hovering;
// touch, keyboard, and assistive tools toggle it. Only one sub-menu is open at a time. Short
// delays stop menus flashing open as the mouse crosses the header, and stop them snapping shut
// while the mouse travels down to a sub-link.

const HOVER_OPEN_DELAY_MS = 150;
const HOVER_CLOSE_DELAY_MS = 300;

type OpenLabel = string | null;

export type NavMenus = {
  openLabel: OpenLabel;
  open: (label: string) => void;
  close: (label: string) => void;
  toggle: (label: string) => void;
  handleHoverStart: (label: string) => void;
  handleHoverEnd: (label: string) => void;
};

function getClosed(label: string): (openLabel: OpenLabel) => OpenLabel {
  return (openLabel) => (openLabel === label ? null : openLabel);
}

function getToggled(label: string): (openLabel: OpenLabel) => OpenLabel {
  return (openLabel) => (openLabel === label ? null : label);
}

export function useNavMenus(): NavMenus {
  const [openLabel, setOpenLabel] = useState<OpenLabel>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const cancelPending = useCallback(() => window.clearTimeout(timerRef.current), []);
  useEffect(() => cancelPending, [cancelPending]);

  const setNow = (update: SetStateAction<OpenLabel>) => {
    cancelPending();
    setOpenLabel(update);
  };
  const setLater = (update: SetStateAction<OpenLabel>, delayMs: number) => {
    cancelPending();
    timerRef.current = window.setTimeout(() => setOpenLabel(update), delayMs);
  };

  return {
    openLabel,
    open: (label) => setNow(label),
    close: (label) => setNow(getClosed(label)),
    toggle: (label) => setNow(getToggled(label)),
    // Moving from one open sub-menu to the next switches at once; the first one waits.
    handleHoverStart: (label) => setLater(label, openLabel === null ? HOVER_OPEN_DELAY_MS : 0),
    handleHoverEnd: (label) => setLater(getClosed(label), HOVER_CLOSE_DELAY_MS),
  };
}

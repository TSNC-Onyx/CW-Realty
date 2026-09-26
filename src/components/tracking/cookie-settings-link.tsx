"use client";

import type { MouseEvent, ReactNode } from "react";

import { requestCookieSettings } from "@/components/tracking/cookie-events";

// "Cookie settings" in the footer and privacy policy: opens the settings dialog when trackers
// are set up, and otherwise (or without JavaScript) goes to the privacy policy's cookie section.

export const COOKIE_SECTION_PATH = "/privacy-policy#cookies";

export function CookieSettingsLink({ className, children }: { className: string; children: ReactNode }) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (requestCookieSettings()) event.preventDefault();
  };
  return (
    <a href={COOKIE_SECTION_PATH} onClick={handleClick} className={className}>
      {children}
    </a>
  );
}

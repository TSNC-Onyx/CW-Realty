"use client";

import { useCallback, useEffect, useState } from "react";

import { CookieBanner } from "@/components/tracking/cookie-banner";
import { OPEN_COOKIE_SETTINGS_EVENT } from "@/components/tracking/cookie-events";
import { CookieSettingsDialog } from "@/components/tracking/cookie-settings-dialog";
import { useConsent, type ConsentOptions } from "@/components/tracking/use-consent";
import { REJECTED_CONSENT, getAcceptAllConsent, type ConsentChoice } from "@/lib/tracking/consent";
import { pushKeyEvent, type KeyEventName } from "@/lib/tracking/data-layer";

// Features §3–4 on every public page once a Tag Manager container is set up: the banner until
// the visitor chooses, the settings dialog on request, and the call/text key events.

const CONTACT_LINK_EVENTS: Record<string, KeyEventName> = { "tel:": "cwr_call", "sms:": "cwr_text" };
const CONTACT_LINK_SELECTOR = 'a[href^="tel:"], a[href^="sms:"]';

function getContactLinkEvent(target: EventTarget | null): KeyEventName | null {
  if (!(target instanceof Element)) return null;
  const href = target.closest(CONTACT_LINK_SELECTOR)?.getAttribute("href") ?? "";
  return CONTACT_LINK_EVENTS[href.slice(0, 4)] ?? null;
}

function useContactLinkEvents(): void {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const name = getContactLinkEvent(event.target);
      if (name) pushKeyEvent({ name, eventId: crypto.randomUUID() });
    };
    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, []);
}

function useSettingsRequests(onOpen: () => void): void {
  useEffect(() => {
    const handleRequest = (event: Event) => {
      event.preventDefault();
      onOpen();
    };
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, handleRequest);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, handleRequest);
  }, [onOpen]);
}

export function ConsentManager(options: ConsentOptions) {
  const { choice, isGpcOn, saveChoice } = useConsent(options);
  const [settingsOpenCount, setSettingsOpenCount] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  useContactLinkEvents();

  const handleOpenSettings = useCallback(() => {
    setSettingsOpenCount((count) => count + 1);
    setIsSettingsOpen(true);
  }, []);
  useSettingsRequests(handleOpenSettings);

  const handleSave = (next: ConsentChoice) => {
    setIsSettingsOpen(false);
    saveChoice(next);
  };

  return (
    <>
      {choice === null && (
        <CookieBanner isGpcOn={isGpcOn} onAcceptAll={() => saveChoice(getAcceptAllConsent({ isGpcOn }))} onRejectAll={() => saveChoice(REJECTED_CONSENT)} onOpenSettings={handleOpenSettings} />
      )}
      {/* A new key on each opening starts the switches from the saved choice. */}
      <CookieSettingsDialog key={settingsOpenCount} isOpen={isSettingsOpen} choice={choice} isGpcOn={isGpcOn} onSave={handleSave} onClose={() => setIsSettingsOpen(false)} />
    </>
  );
}

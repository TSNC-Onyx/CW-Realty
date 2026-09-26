"use client";

import Link from "next/link";

import { getButtonClassName } from "@/components/ui/button-link";

// Style §11.13 cookie banner: dark panel, "Accept all" and "Reject all" as equal gold
// buttons, and a "Cookie settings" link. It never takes focus, so it does not interrupt.

const HEADING_ID = "cookie-banner-heading";
const GOLD_BUTTON = getButtonClassName({ size: "s", variant: "main", tone: "dark" });

export type CookieBannerProps = {
  isGpcOn: boolean;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onOpenSettings: () => void;
};

export function CookieBanner({ isGpcOn, onAcceptAll, onRejectAll, onOpenSettings }: CookieBannerProps) {
  return (
    <section aria-labelledby={HEADING_ID} className="tone-dark cookie-banner-position fixed inset-x-0 z-40 flex flex-col gap-4 p-5 lg:right-auto">
      <h2 id={HEADING_ID} className="sr-only">
        Cookie choices
      </h2>
      <p className="max-w-prose text-base">
        {"We use cookies to understand how people use this site and to measure our ads. You choose. "}
        <Link href="/privacy-policy#cookies" className="font-semibold underline underline-offset-4">
          Read our privacy policy
        </Link>
      </p>
      {isGpcOn && <p className="type-small text-on-dark-muted">Your browser asks sites not to share your information, so advertising cookies stay off.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onAcceptAll} className={GOLD_BUTTON}>
          Accept all
        </button>
        <button type="button" onClick={onRejectAll} className={GOLD_BUTTON}>
          Reject all
        </button>
        <button type="button" onClick={onOpenSettings} className="flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">
          Cookie settings
        </button>
      </div>
    </section>
  );
}

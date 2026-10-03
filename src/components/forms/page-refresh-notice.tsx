"use client";

import { useEffect, useEffectEvent, useState, type ReactNode } from "react";

import { isRefreshLoop, refreshKeepingValues } from "@/components/forms/form-restore";
import { getButtonClassName } from "@/components/ui/button-link";
import { BOT_CHECK_ACTION_LABELS, BOT_CHECK_MESSAGES } from "@/lib/security/bot-check-messages";

// Shown when the server says this page is out of date (docs/cwr-stale-quick-check-addendum.md
// §3). Sign-in pages refresh themselves after 3 seconds, long enough for a screen reader to
// finish the announcement (decision DA1); public forms offer a button so a long message is
// never lost. If one refresh in the last minute didn't help, it says to reopen the page instead.

const AUTO_REFRESH_DELAY_MS = 3000;

type PageRefreshNoticeProps = {
  formId: string;
  /** automatic: refresh by itself (sign-in pages) · button: only when tapped (public forms). */
  mode: "automatic" | "button";
  /** What to keep across the refresh (never passwords). Read at the moment of refreshing. */
  getValues: () => Record<string, string>;
  /** Called once when refreshing isn't fixing the page, so it can be recorded. */
  onRefreshLoop: () => void;
  /** Another way to reach us, shown with the "close this tab" advice. */
  fallback?: ReactNode;
};

export function PageRefreshNotice({ formId, mode, getValues, onRefreshLoop, fallback }: PageRefreshNoticeProps) {
  const [isLoop] = useState(isRefreshLoop);
  const handleRefresh = () => refreshKeepingValues({ formId, values: getValues() });
  const handleMount = useEffectEvent(() => {
    if (isLoop) onRefreshLoop();
  });
  const handleAutoRefresh = useEffectEvent(handleRefresh);

  useEffect(() => handleMount(), []);

  useEffect(() => {
    if (isLoop || mode !== "automatic") return;
    const timer = window.setTimeout(() => handleAutoRefresh(), AUTO_REFRESH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [isLoop, mode]);

  if (isLoop) {
    return (
      <div role="alert" className="grid gap-2 border border-error bg-error-tint p-4 text-ink">
        <p className="text-base leading-normal font-bold">{BOT_CHECK_MESSAGES.refreshLoop}</p>
        {fallback}
      </div>
    );
  }
  const message = mode === "automatic" ? BOT_CHECK_MESSAGES.outdatedAutoRefresh : BOT_CHECK_MESSAGES.outdatedRefreshButton;
  const buttonLabel = mode === "automatic" ? BOT_CHECK_ACTION_LABELS.refreshNow : BOT_CHECK_ACTION_LABELS.refreshPage;
  return (
    <div role="status" className="grid justify-items-start gap-3 border border-info bg-info-tint p-4 text-ink">
      <p className="text-base leading-normal font-bold">{message}</p>
      <button type="button" onClick={handleRefresh} className={getButtonClassName({ size: "s", variant: "secondary" })}>
        {buttonLabel}
      </button>
    </div>
  );
}

/** "Refresh page" for any refused Quick Check: a stale page is the usual cause, and it keeps what was typed. */
export function RefreshPageButton({ formId, getValues }: Pick<PageRefreshNoticeProps, "formId" | "getValues">) {
  return (
    <button type="button" onClick={() => refreshKeepingValues({ formId, values: getValues() })} className="text-link mt-1 min-h-11">
      {BOT_CHECK_ACTION_LABELS.refreshPage}
    </button>
  );
}

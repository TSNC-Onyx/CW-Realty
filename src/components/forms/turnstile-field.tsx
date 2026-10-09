"use client";

import { Turnstile } from "@marsidev/react-turnstile";
import { useId, type ReactNode } from "react";

import type { BotCheck, BotCheckStatus } from "@/components/forms/use-bot-check";
import { BOT_CHECK_KEY_FIELD } from "@/lib/security/bot-check-key";
import { BOT_CHECK_ACTION_LABELS, BOT_CHECK_MESSAGES } from "@/lib/security/bot-check-messages";

// Cloudflare Turnstile, the "Quick Check". It usually passes invisibly and only asks for a
// tick when something looks automated. Its token lands in the form as "cf-turnstile-response";
// the key this page was built with goes alongside, so the server can tell an out-of-date
// page from a refused check (docs/cwr-stale-quick-check-addendum.md §1).

/** fallback: another way to reach us, shown when the check can't run (for example the phone number). */
type TurnstileFieldProps = { action: string; botCheck: BotCheck; fallback?: ReactNode };

/** What to tell the person; null while nothing needs saying. */
function getStatusText({ status, isHolding }: { status: BotCheckStatus; isHolding: boolean }): string | null {
  if (status === "failed") return BOT_CHECK_MESSAGES.notLoaded;
  if (status === "unavailable") return BOT_CHECK_MESSAGES.unavailable;
  if (status === "needs_click") return BOT_CHECK_MESSAGES.needsClick;
  return isHolding ? BOT_CHECK_MESSAGES.checking : null;
}

// The live region stays in the page (empty when there is nothing to say) so screen readers
// announce each change.
function BotCheckStatusLine({ botCheck, fallback }: { botCheck: BotCheck; fallback?: ReactNode }) {
  const isBroken = botCheck.status === "failed" || botCheck.status === "unavailable";
  return (
    <p role="status" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-base empty:mt-0">
      {getStatusText(botCheck)}
      {botCheck.status === "failed" && (
        <button type="button" onClick={botCheck.retry} className="text-link min-h-11">
          {BOT_CHECK_ACTION_LABELS.retry}
        </button>
      )}
      {isBroken && fallback}
    </p>
  );
}

export function TurnstileField({ action, botCheck, fallback }: TurnstileFieldProps) {
  const widgetId = `cf-turnstile-${useId().replaceAll(":", "")}`;
  const { siteKey, handlers } = botCheck;
  return (
    <div className="grid">
      {siteKey && (
        <Turnstile
          key={botCheck.widgetKey}
          id={widgetId}
          siteKey={siteKey}
          options={{ action, size: "flexible", theme: "light", appearance: "interaction-only" }}
          scriptOptions={{ onError: handlers.onScriptError }}
          onSuccess={handlers.onSuccess}
          onExpire={handlers.onExpire}
          onError={handlers.onError}
          onUnsupported={handlers.onUnsupported}
          onTimeout={handlers.onTimeout}
          onBeforeInteractive={handlers.onBeforeInteractive}
          onAfterInteractive={handlers.onAfterInteractive}
        />
      )}
      {siteKey && <input type="hidden" name={BOT_CHECK_KEY_FIELD} defaultValue={siteKey} />}
      <BotCheckStatusLine botCheck={botCheck} fallback={fallback} />
    </div>
  );
}

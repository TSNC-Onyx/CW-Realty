"use client";

import { Turnstile } from "@marsidev/react-turnstile";

import type { BrowserProblemCode } from "@/lib/observability/client-problem";
import type { ProblemAction } from "@/lib/observability/problem-catalog";
import { reportClientProblem } from "@/lib/observability/report-client-problem";

// The Cloudflare Turnstile bot check on the sign-in forms (the same widget and settings as
// the public forms' TurnstileField). When the check can't load or run, sign-in quietly
// fails, so the first failure on each page load is recorded (docs/cwr-error-tracking-plan.md).

const BOT_CHECK_ACTION: ProblemAction = "auth.bot_check_widget";

type SignInBotCheckProps = { action: string; resetKey: string };

type BotCheckFailure = { code: BrowserProblemCode; detail: string };

let hasReportedFailure = false;

function handleBotCheckFailure({ code, detail }: BotCheckFailure): void {
  if (hasReportedFailure) return;
  hasReportedFailure = true;
  void reportClientProblem({ action: BOT_CHECK_ACTION, stage: "browser", severity: "warning", code, detail });
}

export function SignInBotCheck({ action, resetKey }: SignInBotCheckProps) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!siteKey) return null;
  return (
    <Turnstile
      key={resetKey}
      siteKey={siteKey}
      options={{ action, size: "flexible", theme: "light", appearance: "interaction-only" }}
      scriptOptions={{ onError: () => handleBotCheckFailure({ code: "network", detail: "The bot check script didn't load." }) }}
      onError={(widgetError) => handleBotCheckFailure({ code: "script_error", detail: `Bot check error ${widgetError}` })}
      onUnsupported={() => handleBotCheckFailure({ code: "script_error", detail: "This browser can't run the bot check." })}
    />
  );
}

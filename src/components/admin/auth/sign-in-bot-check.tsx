"use client";

import { TurnstileField } from "@/components/forms/turnstile-field";
import { useBotCheck, type BotCheck } from "@/components/forms/use-bot-check";
import { reportClientProblem } from "@/lib/observability/report-client-problem";

// The Quick Check on the sign-in forms: the same widget, wording and behaviour as the public
// forms (docs/cwr-reliability-round-plan.md §2.6). When it can't load or run, the first
// failure on each page view is recorded (docs/cwr-error-tracking-plan.md).

export function useSignInBotCheck(resetKey: string): BotCheck {
  return useBotCheck({ problemAction: "auth.bot_check_widget", reportProblem: reportClientProblem, resetKey });
}

export function SignInBotCheck({ action, botCheck }: { action: string; botCheck: BotCheck }) {
  return <TurnstileField action={action} botCheck={botCheck} />;
}

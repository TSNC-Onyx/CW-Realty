"use server";

import { ChatLogError } from "@/lib/chat/chat-log";
import { fetchGuidedMenu, recordGuidedStep, type GuidedMenuResult, type GuidedStepInput, type GuidedStepResult } from "@/lib/chat/guided-steps";
import { getErrorName, reportVisitorProblem } from "@/lib/observability/report-visitor-problem";
import { fetchVisitor } from "@/lib/security/visitor";

// Public entry points for the chat topic buttons. A failure never blocks the visitor: the menu
// is simply left out, or the tap isn't saved. Each one is recorded by the error's name and the
// step that broke (Customer-facing errors must be logged).

async function reportFailure({ error, detail }: { error: unknown; detail: string }): Promise<void> {
  const step = error instanceof ChatLogError ? ` (step: ${error.context.step})` : "";
  await reportVisitorProblem({ action: "site.chat_widget", stage: "unexpected", severity: "warning", code: getErrorName(error), detail: `${detail}${step}` });
}

export async function fetchGuidedMenuAction(): Promise<GuidedMenuResult> {
  try {
    return await fetchGuidedMenu();
  } catch (error) {
    await reportFailure({ error, detail: "The chat topic buttons could not load; the chat opened without them." });
    return { status: "unavailable" };
  }
}

export async function recordGuidedStepAction(input: GuidedStepInput): Promise<GuidedStepResult> {
  try {
    return await recordGuidedStep({ input, visitor: await fetchVisitor() });
  } catch (error) {
    await reportFailure({ error, detail: "A chat topic button tap could not be saved to the chat log; the visitor still saw the answer." });
    return { status: "skipped" };
  }
}

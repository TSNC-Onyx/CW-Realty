"use client";

import { FlaskConical, LoaderCircle, Square } from "lucide-react";
import { useRef } from "react";

import { useTestRun } from "@/components/admin/chat-policy/use-test-run";
import { getButtonClassName } from "@/components/ui/button-link";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// "Run the tests" with a progress line and Stop (docs/cwr-chat-policy-test-batches-plan.md, Part A).
// The run button stays on the page and keeps keyboard focus; when Stop goes away at the end
// of a run, focus moves back to the run button instead of being lost (WCAG 2.4.3).

/** isBlocked: the editor holds unsaved text, so a run would test something other than what's on screen (bug 11). */
type PolicyTestRunButtonProps = { draftId: string; isBlocked: boolean; onRunningChange: (isRunning: boolean) => void };

export function PolicyTestRunButton({ draftId, isBlocked, onRunningChange }: PolicyTestRunButtonProps) {
  const runButtonRef = useRef<HTMLButtonElement>(null);
  const stopButtonRef = useRef<HTMLButtonElement>(null);
  const handleRunningChange = (isRunning: boolean) => {
    if (!isRunning && document.activeElement === stopButtonRef.current) runButtonRef.current?.focus();
    onRunningChange(isRunning);
  };
  const { isRunning, isStopping, progressText, startRun, stopRun } = useTestRun({ draftId, onRunningChange: handleRunningChange });
  const buttonClassName = `${getButtonClassName({ size: "s", variant: "secondary" })} px-3`;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-3">
        <button ref={runButtonRef} type="button" onClick={isBlocked ? undefined : startRun} aria-disabled={isRunning || isBlocked} aria-busy={isRunning} aria-label={isRunning ? "Testing the saved draft" : "Run the tests on the saved draft"} className={buttonClassName}>
          {isRunning ? <LoaderCircle aria-hidden size={ICON_SIZE.button} className="animate-spin" /> : <FlaskConical aria-hidden size={ICON_SIZE.button} />}
          {isRunning ? "Testing…" : "Run the tests"}
        </button>
        {isRunning && (
          <button ref={stopButtonRef} type="button" onClick={stopRun} aria-disabled={isStopping} className={buttonClassName}>
            <Square aria-hidden size={ICON_SIZE.button} />
            {isStopping ? "Stopping…" : "Stop"}
          </button>
        )}
      </div>
      <p role="status" className="type-small text-muted">
        {isStopping ? "Stopping after the questions being tested now…" : progressText}
      </p>
    </div>
  );
}

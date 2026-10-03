"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useToast } from "@/components/admin/toast-provider";
import { finishPolicyTestRunAction, runPolicyTestBatchAction, startPolicyTestRunAction } from "@/lib/admin/chat-policy/actions";
import { BATCH_SIZE, type TestRunStart } from "@/lib/admin/chat-policy/test-batches";
import type { QuickResult } from "@/lib/admin/quick-result";
import { callQuickAction } from "@/lib/observability/call-server-action";

// A policy test run, one batch per request (docs/cwr-chat-policy-test-batches-plan.md, Part A),
// so no request goes past the Free plan's 50 outside calls. The page is then refreshed in a
// fresh request, so every section redraws.

const MS_PER_MINUTE = 60_000;

type RunOutcome = "finished" | "stopped" | "failed";

export type TestRun = { isRunning: boolean; isStopping: boolean; progressText: string; startRun: () => Promise<void>; stopRun: () => void };

function isRunStart(result: TestRunStart | QuickResult): result is TestRunStart {
  return result.status === "success" && "runKey" in result;
}

function getTimeLeftText({ elapsedMs, batchesDone, batchCount }: { elapsedMs: number; batchesDone: number; batchCount: number }): string {
  if (batchesDone === 0) return "";
  const minutesLeft = Math.round(((elapsedMs / batchesDone) * (batchCount - batchesDone)) / MS_PER_MINUTE);
  return minutesLeft < 1 ? " Less than a minute left." : ` About ${minutesLeft} min left.`;
}

function getProgressText({ batchIndex, total, timeLeftText }: { batchIndex: number; total: number; timeLeftText: string }): string {
  const first = batchIndex * BATCH_SIZE + 1;
  const last = Math.min((batchIndex + 1) * BATCH_SIZE, total);
  return `Testing questions ${first}–${last} of ${total}…${timeLeftText}`;
}

/** Leaving mid-run loses it (nothing is saved until the end), so the browser asks first. */
function useLeaveWarning(isRunning: boolean): void {
  useEffect(() => {
    if (!isRunning) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isRunning]);
}

/** onRunningChange: tells the page a run started or ended, so Publish and its reason follow. */
export function useTestRun({ draftId, onRunningChange }: { draftId: string; onRunningChange: (isRunning: boolean) => void }): TestRun {
  const router = useRouter();
  const { showToast } = useToast();
  const [isRunning, setIsRunning] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [progressText, setProgressText] = useState("");
  const isStopRequestedRef = useRef(false);
  useLeaveWarning(isRunning);

  const showResult = (result: QuickResult) => showToast({ tone: result.status === "success" ? "success" : "error", title: result.message });

  const runBatches = async (run: TestRunStart): Promise<RunOutcome> => {
    const startedAt = Date.now();
    for (let batchIndex = 0; batchIndex < run.batchCount; batchIndex += 1) {
      if (isStopRequestedRef.current) return "stopped";
      setProgressText(getProgressText({ batchIndex, total: run.total, timeLeftText: getTimeLeftText({ elapsedMs: Date.now() - startedAt, batchesDone: batchIndex, batchCount: run.batchCount }) }));
      const batch = await callQuickAction("chat_policy.run_tests", () => runPolicyTestBatchAction({ runKey: run.runKey, batchIndex }));
      if (batch.status === "error") {
        showResult(batch);
        return "failed";
      }
    }
    return isStopRequestedRef.current ? "stopped" : "finished";
  };

  const runTests = async (): Promise<void> => {
    const start = await callQuickAction("chat_policy.start_tests", () => startPolicyTestRunAction(draftId));
    if (!isRunStart(start)) {
      showResult(start);
      return;
    }
    const outcome = await runBatches(start);
    if (outcome === "stopped") showToast({ tone: "success", title: "Tests stopped. Nothing was saved." });
    if (outcome !== "finished") return;
    setProgressText("Saving the results…");
    showResult(await callQuickAction("chat_policy.finish_tests", () => finishPolicyTestRunAction({ runKey: start.runKey })));
    router.refresh();
  };

  const startRun = async () => {
    if (isRunning) return;
    isStopRequestedRef.current = false;
    setIsRunning(true);
    onRunningChange(true);
    await runTests();
    // Told first, while Stop is still on the page, so focus can move off it.
    onRunningChange(false);
    setIsRunning(false);
    setIsStopping(false);
    setProgressText("");
  };

  const stopRun = () => {
    isStopRequestedRef.current = true;
    setIsStopping(true);
  };

  return { isRunning, isStopping, progressText, startRun, stopRun };
}

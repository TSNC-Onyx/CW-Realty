"use client";

import { useEffect } from "react";

import type { ProblemAction } from "@/lib/observability/problem-catalog";
import { flushQueuedProblems, reportClientProblem, setProblemReporterUser } from "@/lib/observability/report-client-problem";
import { getErrorSignature, getUncaughtReport, isFirstSighting } from "@/lib/observability/uncaught-error";

// Watches an admin or sign-in page for browser errors nobody caught, and sends reports kept
// while offline (docs/cwr-error-tracking-plan.md). What counts as an error, a note, or a
// repeat is decided in src/lib/observability/uncaught-error.ts.

function reportUncaught({ action, error, source }: { action: ProblemAction; error: unknown; source: string }): void {
  if (!isFirstSighting(getErrorSignature(error))) return;
  void reportClientProblem({ action, stage: "browser", ...getUncaughtReport({ error, source }) });
}

export function ProblemReporter({ userId, action }: { userId: string | null; action: ProblemAction }) {
  useEffect(() => {
    setProblemReporterUser(userId);
    void flushQueuedProblems();
    const handleError = (event: ErrorEvent) => reportUncaught({ action, error: event.error ?? event.message, source: event.filename });
    const handleRejection = (event: PromiseRejectionEvent) => reportUncaught({ action, error: event.reason, source: "" });
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, [userId, action]);
  return null;
}

"use client";

import { useEffect } from "react";

import type { ProblemAction } from "@/lib/observability/problem-catalog";
import { flushQueuedProblems, reportClientProblem, setProblemReporterUser } from "@/lib/observability/report-client-problem";

// Watches an admin or sign-in page for browser errors nobody caught, and sends reports kept
// while offline (docs/cwr-error-tracking-plan.md). Errors from our own code count as errors;
// errors from browser extensions or other scripts are only noted. Each distinct error is
// reported once per browser session.

const SEEN_KEY = "cwr-problem-seen";
const OWN_CODE_MARKER = "/_next/";

function isFirstSighting(signature: string): boolean {
  try {
    const seen = new Set<string>(JSON.parse(window.sessionStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
    if (seen.has(signature)) return false;
    window.sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen, signature].slice(-50)));
    return true;
  } catch {
    return true;
  }
}

function reportUncaught({ action, error, source }: { action: ProblemAction; error: unknown; source: string }): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const stack = error instanceof Error ? (error.stack ?? "") : "";
  if (!isFirstSighting(message)) return;
  const isOwnCode = `${stack}\n${source}`.includes(OWN_CODE_MARKER);
  const code = error instanceof Error && error.name === "ChunkLoadError" ? "chunk_load" : "script_error";
  void reportClientProblem({ action, stage: "browser", severity: isOwnCode ? "error" : "info", code, detail: `${message}\n${stack}`.slice(0, 2000) });
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

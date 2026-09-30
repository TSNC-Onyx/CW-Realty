"use client";

import { useEffect, useState } from "react";

import type { ProblemAction } from "@/lib/observability/problem-catalog";
import { reportClientProblem } from "@/lib/observability/report-client-problem";

// Error screens report the crash they replace and show its reference code. A crash in
// server rendering carries a digest the server already recorded (instrumentation.ts), so
// the report returns that same reference instead of recording it twice.
export function useReportedCrash(error: Error & { digest?: string }, action: ProblemAction): string | null {
  const [reference, setReference] = useState<string | null>(null);
  useEffect(() => {
    const detail = error.digest ? undefined : `${error.name}: ${error.message}\n${error.stack ?? ""}`.slice(0, 2000);
    void reportClientProblem({ action, stage: "unexpected", severity: "error", code: "script_error", digest: error.digest, detail }).then(setReference);
  }, [error, action]);
  return reference;
}

"use client";

import { useEffect } from "react";

import { reportVisitorClientProblem } from "@/lib/observability/report-client-problem";
import { getErrorSignature, getUncaughtReport, isFirstSighting } from "@/lib/observability/uncaught-error";

// Watches a public page for browser errors nobody caught (docs/error-logging-a-grade-plan.md,
// Phase B), using the same rules as the admin's watcher. The server keeps only the code
// locations of a visitor's report, never the error text (app/admin/problems/report/route.ts).

function reportUncaught({ error, source }: { error: unknown; source: string }): void {
  if (!isFirstSighting(getErrorSignature(error))) return;
  void reportVisitorClientProblem({ action: "site.browser_error", stage: "browser", ...getUncaughtReport({ error, source }) });
}

export function VisitorProblemReporter() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => reportUncaught({ error: event.error ?? event.message, source: event.filename });
    const handleRejection = (event: PromiseRejectionEvent) => reportUncaught({ error: event.reason, source: "" });
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);
  return null;
}

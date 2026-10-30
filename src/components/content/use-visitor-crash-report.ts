"use client";

import { useEffect } from "react";

import { isOutsideBrowserError } from "@/lib/observability/browser-noise";
import { reportVisitorClientProblem } from "@/lib/observability/report-client-problem";

// A public page's crash screen reports the crash it replaces (docs/error-logging-a-grade-plan.md,
// Phase B). A crash while the server built the page carries the digest the server already
// recorded, so it joins that record instead of being counted again.
export function useVisitorCrashReport(error: Error & { digest?: string }): void {
  useEffect(() => {
    const severity = isOutsideBrowserError(error) ? "info" : "error";
    const detail = error.digest ? undefined : `${error.name}\n${error.stack ?? ""}`.slice(0, 2000);
    void reportVisitorClientProblem({ action: "site.page_crash", stage: "unexpected", severity, code: "script_error", digest: error.digest, detail });
  }, [error]);
}

"use client";

import { useEffect, useState } from "react";

import { isAdminPath } from "@/lib/admin/paths";
import { isOutsideBrowserError } from "@/lib/observability/browser-noise";
import { reportClientProblem, reportVisitorClientProblem } from "@/lib/observability/report-client-problem";

import "./globals.css";

// Last-resort screen when the root layout itself fails. On admin pages the crash is recorded
// and its reference code shown (docs/cwr-error-tracking-plan.md); on public pages it is
// recorded without one (docs/error-logging-a-grade-plan.md, Phase B).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reference, setReference] = useState<string | null>(null);
  useEffect(() => {
    const severity = isOutsideBrowserError(error) ? "info" : "error";
    if (!isAdminPath(window.location.pathname)) {
      void reportVisitorClientProblem({ action: "site.page_crash", stage: "unexpected", severity, code: "script_error", digest: error.digest });
      return;
    }
    void reportClientProblem({ action: "portal.page_crash", stage: "unexpected", severity, code: "script_error", digest: error.digest }).then(setReference);
  }, [error]);
  return (
    <html lang="en">
      <body className="mx-auto max-w-form px-4 py-12">
        <h1 className="type-h1 mb-6">Something went wrong</h1>
        <p className="type-lead">This page didn&apos;t load. Try again in a moment.</p>
        {reference && <p className="mt-2">Reference: {reference}</p>}
        <button type="button" onClick={reset} className="mt-6 underline">
          Try again
        </button>
      </body>
    </html>
  );
}

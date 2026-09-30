"use client";

import { useEffect, useState } from "react";

import { isAdminPath } from "@/lib/admin/paths";
import { reportClientProblem } from "@/lib/observability/report-client-problem";

import "./globals.css";

// Last-resort screen when the root layout itself fails. On admin pages the crash is recorded
// and its reference code shown (docs/cwr-error-tracking-plan.md); public pages are out of
// that plan's scope and show the plain message only.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reference, setReference] = useState<string | null>(null);
  useEffect(() => {
    if (!isAdminPath(window.location.pathname)) return;
    void reportClientProblem({ action: "portal.page_crash", stage: "unexpected", severity: "error", code: "script_error", digest: error.digest }).then(setReference);
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

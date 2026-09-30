"use client";

import { RotateCw } from "lucide-react";

import { useReportedCrash } from "@/components/admin/use-reported-crash";
import { getButtonClassName } from "@/components/ui/button-link";
import { Message } from "@/components/ui/message";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Shown in place of a sign-in step that failed to load. The crash is recorded and its
// reference code shown (docs/cwr-error-tracking-plan.md).
export default function SignInError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const reference = useReportedCrash(error, "auth.browser_error");
  return (
    <>
      <h1 className="type-h1 mb-6">This step didn&apos;t load</h1>
      <Message tone="error" title="We couldn't load this sign-in step">
        <p>Try again in a moment. If it keeps happening, tell the site owner.</p>
        {reference && <p className="mt-1">Reference: {reference}</p>}
      </Message>
      <button type="button" onClick={reset} className={`${getButtonClassName({ size: "m", variant: "main" })} mt-6`}>
        <RotateCw aria-hidden size={ICON_SIZE.button} />
        Try again
      </button>
    </>
  );
}

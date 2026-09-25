"use client";

import { RotateCw } from "lucide-react";

import { getButtonClassName } from "@/components/ui/button-link";
import { Message } from "@/components/ui/message";
import { Section } from "@/components/ui/section";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Shown in place of a page's content when loading it fails; the header, footer, and
// Call/Text/Chat bar keep working (Infra §3 "fail gracefully").
export default function PageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Section labelledBy="page-error-heading">
      <h1 id="page-error-heading" className="type-h1 mb-6">This page didn&apos;t load</h1>
      <div className="max-w-prose">
        <Message tone="error" title="We couldn't load this page">
          <p>Please try again in a moment. You can still call, text, or email us using the links on this page.</p>
        </Message>
      </div>
      <button type="button" onClick={reset} className={`${getButtonClassName({ size: "l", variant: "main" })} mt-6`}>
        <RotateCw aria-hidden size={ICON_SIZE.button} />
        Try again
      </button>
    </Section>
  );
}

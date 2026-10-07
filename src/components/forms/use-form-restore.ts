"use client";

import { useEffect, useEffectEvent } from "react";

import { takeRestoredValues } from "@/components/forms/form-restore";

// Puts back what someone typed before an out-of-date page refreshed itself
// (docs/cwr-stale-quick-check-addendum.md §3). Runs once after the page loads, so the server
// and browser render the same empty form first.

type FormRestoreOptions = { formId: string; fieldNames: readonly string[]; onRestore: (values: Record<string, string>) => void };

export function useFormRestore({ formId, fieldNames, onRestore }: FormRestoreOptions): void {
  const handleRestore = useEffectEvent(() => {
    const restored = takeRestoredValues({ formId, fieldNames });
    if (restored) onRestore(restored);
  });
  useEffect(() => handleRestore(), []);
}

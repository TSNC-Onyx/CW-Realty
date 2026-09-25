"use client";

import { LoaderCircle, Save } from "lucide-react";
import type { ReactNode } from "react";

import { getButtonClassName } from "@/components/ui/button-link";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Admin §1: one Save button per screen, always in view at the bottom.
export function SaveBar({ isPending, isDirty, label = "Save changes", children }: { isPending: boolean; isDirty: boolean; label?: string; children?: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-10 flex flex-wrap items-center gap-4 border-t border-line bg-page px-4 py-3 md:-mx-8 md:px-8">
      <button type="submit" aria-busy={isPending} className={getButtonClassName({ size: "l", variant: "main" })}>
        {isPending ? <LoaderCircle aria-hidden size={ICON_SIZE.button} className="animate-spin" /> : <Save aria-hidden size={ICON_SIZE.button} />}
        {isPending ? "Saving…" : label}
      </button>
      <p className="type-small text-muted" aria-live="polite">
        {isDirty ? "You have unsaved changes." : "All changes saved."}
      </p>
      {children}
    </div>
  );
}

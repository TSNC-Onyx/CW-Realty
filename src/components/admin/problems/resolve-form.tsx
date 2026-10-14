"use client";

import { CircleCheck, LoaderCircle } from "lucide-react";
import { useId, useRef, useTransition } from "react";

import { useToast } from "@/components/admin/toast-provider";
import { getButtonClassName } from "@/components/ui/button-link";
import { resolveProblemAction } from "@/lib/admin/problems/actions";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { callQuickAction } from "@/lib/observability/call-server-action";

// "Mark resolved" with a note for the review (docs/cwr-error-tracking-plan.md "Resolve").
export function ResolveForm({ groupId }: { groupId: string }) {
  const noteId = useId();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();

  const handleResolve = () =>
    startTransition(async () => {
      const result = await callQuickAction("problems.resolve", () => resolveProblemAction({ groupId, note: noteRef.current?.value ?? "" }));
      showToast({ tone: result.status === "success" ? "success" : "error", title: result.message });
    });

  return (
    <div className="grid max-w-prose gap-3">
      <label htmlFor={noteId} className="text-base font-bold">
        What was done about it (optional)
      </label>
      <textarea id={noteId} ref={noteRef} rows={3} maxLength={1000} aria-describedby={`${noteId}-helper`} className="field-input" />
      <p id={`${noteId}-helper`} className="type-small -mt-2 text-muted">
        Kept with the problem for later reviews.
      </p>
      <div>
        <button type="button" onClick={handleResolve} aria-busy={isPending} className={getButtonClassName({ size: "m", variant: "main" })}>
          {isPending ? <LoaderCircle aria-hidden size={ICON_SIZE.button} className="animate-spin" /> : <CircleCheck aria-hidden size={ICON_SIZE.button} />}
          {isPending ? "Marking resolved…" : "Mark resolved"}
        </button>
      </div>
    </div>
  );
}

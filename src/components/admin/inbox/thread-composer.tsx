"use client";

import { LoaderCircle, NotebookPen, Send } from "lucide-react";
import { useId, useRef, useState, useTransition } from "react";

import { useToast } from "@/components/admin/toast-provider";
import { useUnsavedChanges } from "@/components/admin/use-unsaved-changes";
import { getButtonClassName } from "@/components/ui/button-link";
import type { QuickResult } from "@/lib/admin/quick-result";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

type ThreadComposerProps = {
  label: string;
  helperText: string;
  buttonLabel: string;
  pendingLabel: string;
  kind: "reply" | "note";
  onSend: (text: string) => Promise<QuickResult>;
};

// A reply or note box: keeps the text if sending fails, warns before leaving with a draft.
export function ThreadComposer({ label, helperText, buttonLabel, pendingLabel, kind, onSend }: ThreadComposerProps) {
  const Icon = kind === "reply" ? Send : NotebookPen;
  const textareaId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  useUnsavedChanges(hasDraft);

  const handleSend = () =>
    startTransition(async () => {
      const result = await onSend(textareaRef.current?.value ?? "");
      showToast({ tone: result.status === "success" ? "success" : "error", title: result.message });
      if (result.status !== "success" || !textareaRef.current) return;
      textareaRef.current.value = "";
      setHasDraft(false);
    });

  return (
    <div className="grid max-w-prose gap-3">
      <label htmlFor={textareaId} className="text-base font-bold">
        {label}
      </label>
      <textarea id={textareaId} ref={textareaRef} rows={5} maxLength={20000} onInput={() => setHasDraft(true)} aria-describedby={`${textareaId}-helper`} className="field-input" />
      <p id={`${textareaId}-helper`} className="type-small -mt-2 text-muted">
        {helperText}
      </p>
      <div>
        <button type="button" onClick={handleSend} aria-busy={isPending} className={getButtonClassName({ size: "m", variant: "main" })}>
          {isPending ? <LoaderCircle aria-hidden size={ICON_SIZE.button} className="animate-spin" /> : <Icon aria-hidden size={ICON_SIZE.button} />}
          {isPending ? pendingLabel : buttonLabel}
        </button>
      </div>
    </div>
  );
}

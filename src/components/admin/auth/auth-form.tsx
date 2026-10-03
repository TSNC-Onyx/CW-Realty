"use client";

import { LoaderCircle } from "lucide-react";
import type { FormEvent, ReactNode, Ref } from "react";

import { getButtonClassName } from "@/components/ui/button-link";
import { Message } from "@/components/ui/message";
import type { ActionState } from "@/lib/admin/action-state";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

type AuthFormProps = {
  state: ActionState;
  isPending: boolean;
  submitLabel: string;
  pendingLabel: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  formId?: string;
  formRef?: Ref<HTMLFormElement>;
  /** Shown under the result message (for example "Refresh page"). */
  notice?: ReactNode;
};

// Shared frame for the sign-in steps: result message, fields, one full-width button.
// An out-of-date page shows its refresh notice (in notice) instead of an error message.
export function AuthForm({ state, isPending, submitLabel, pendingLabel, onSubmit, children, formId, formRef, notice }: AuthFormProps) {
  return (
    <form id={formId} ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-6">
      {state.status === "error" && state.recovery !== "refresh" && <Message tone="error" title={state.message} />}
      {notice}
      {state.status === "success" && <Message tone="success" title={state.message} />}
      {children}
      <button type="submit" aria-busy={isPending} className={`${getButtonClassName({ size: "l", variant: "main" })} w-full`}>
        {isPending && <LoaderCircle aria-hidden size={ICON_SIZE.button} className="animate-spin" />}
        {isPending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}

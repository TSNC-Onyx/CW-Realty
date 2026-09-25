"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";

import { useToast } from "@/components/admin/toast-provider";
import { useUnsavedChanges } from "@/components/admin/use-unsaved-changes";
import { IDLE_ACTION_STATE, type ActionState } from "@/lib/admin/action-state";

// Admin form behavior: submit without the browser's automatic form reset (so nothing
// typed is lost), toast each result, focus the first field to fix, and track unsaved changes.

export type AdminAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

function focusFirstInvalidField(form: HTMLFormElement | null): void {
  form?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
}

export function useAdminForm(action: AdminAction, { onSuccess }: { onSuccess?: (state: ActionState) => void } = {}) {
  const [state, dispatch, isPending] = useActionState(action, IDLE_ACTION_STATE);
  const [isDirty, setIsDirty] = useState(false);
  const [handledResponseId, setHandledResponseId] = useState(state.responseId);
  const formRef = useRef<HTMLFormElement>(null);
  const { showToast } = useToast();
  useUnsavedChanges(isDirty);

  if (state.responseId !== handledResponseId) {
    setHandledResponseId(state.responseId);
    if (state.status === "success") setIsDirty(false);
  }

  useEffect(() => {
    if (state.status === "idle") return;
    const tone = state.status === "success" ? "success" : "error";
    const title = state.status === "success" ? state.message : "Check the highlighted fields";
    showToast({ tone, title, body: state.status === "error" ? state.message : undefined });
    if (state.status === "error") focusFirstInvalidField(formRef.current);
    if (state.status === "success") onSuccess?.(state);
    // Runs once per server reply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.responseId]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };

  return { state, isPending, isDirty, formRef, handleSubmit, handleInput: () => setIsDirty(true) };
}

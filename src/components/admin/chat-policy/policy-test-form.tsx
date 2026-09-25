"use client";

import { Plus } from "lucide-react";

import { AdminField } from "@/components/admin/admin-field";
import { AdminSelect } from "@/components/admin/admin-select";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { getButtonClassName } from "@/components/ui/button-link";
import { addPolicyTestAction } from "@/lib/admin/chat-policy/actions";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

export const OUTCOME_OPTIONS = [
  { value: "answer", label: "Answer from the policy" },
  { value: "handoff", label: "Hand off to a person" },
];

export function PolicyTestForm() {
  const { state, isPending, formRef, handleSubmit } = useAdminForm(addPolicyTestAction, { onSuccess: () => formRef.current?.reset() });
  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="grid max-w-form gap-6">
      <AdminField name="question" label="Question a visitor might ask" isMultiline defaultValue={state.values.question} error={state.fieldErrors.question} maxLength={2000} />
      <AdminSelect name="expectedOutcome" label="The assistant should" options={OUTCOME_OPTIONS} defaultValue={state.values.expectedOutcome ?? "answer"} />
      <AdminField
        name="expectedSection"
        label="Section it should cite"
        isOptional
        helperText="The heading title, like “Office hours”. Leave blank if any section is fine."
        defaultValue={state.values.expectedSection}
        error={state.fieldErrors.expectedSection}
        maxLength={200}
      />
      <div>
        <button type="submit" aria-busy={isPending} className={getButtonClassName({ size: "m", variant: "main" })}>
          <Plus aria-hidden size={ICON_SIZE.button} />
          {isPending ? "Adding…" : "Add question"}
        </button>
      </div>
    </form>
  );
}

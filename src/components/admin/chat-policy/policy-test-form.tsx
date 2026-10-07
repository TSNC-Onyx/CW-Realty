"use client";

import { Plus } from "lucide-react";
import { useEffect } from "react";

import { AdminField } from "@/components/admin/admin-field";
import { AdminSelect, type SelectOption } from "@/components/admin/admin-select";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { getButtonClassName } from "@/components/ui/button-link";
import { addPolicyTestAction } from "@/lib/admin/chat-policy/actions";
import { MAX_MENTION_PHRASES } from "@/lib/admin/chat-policy/policy-schema";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Add a test question (docs/cwr-chat-quick-answers-and-tests-plan.md §C): the section comes from
// the draft's own headings, so it can't be mistyped or private; "Should mention" is an optional
// fact check.

export const EXPECTATION_OPTIONS: SelectOption[] = [
  { value: "answer", label: "Answer from the policy" },
  { value: "answer_or_friendly", label: "Answer, or reply in its own words (small talk is fine)" },
  { value: "handoff", label: "Offer a person" },
];

const ANY_SECTION_OPTION: SelectOption = { value: "", label: "Any section" };

type PolicyTestFormProps = {
  /** The draft's headings the assistant may cite. */
  sections: string[];
  /** Section to start on (a coverage hint's "Add a test"), or empty for any. */
  initialSection: string;
  /** Opened from a coverage hint: the question box takes focus. */
  isFocusedOnOpen: boolean;
};

export function PolicyTestForm({ sections, initialSection, isFocusedOnOpen }: PolicyTestFormProps) {
  const { state, isPending, formRef, handleSubmit } = useAdminForm(addPolicyTestAction, {
    problemAction: "chat_policy.add_test",
    onSuccess: () => formRef.current?.reset(),
  });
  const sectionOptions = [ANY_SECTION_OPTION, ...sections.map((section) => ({ value: section, label: section }))];

  useEffect(() => {
    if (isFocusedOnOpen) formRef.current?.querySelector<HTMLElement>('[name="question"]')?.focus();
  }, [isFocusedOnOpen, formRef]);
  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="grid max-w-form gap-6">
      <AdminField name="question" label="Question a visitor might ask" isMultiline defaultValue={state.values.question} error={state.fieldErrors.question} maxLength={2000} />
      <AdminSelect name="expectation" label="The assistant should" options={EXPECTATION_OPTIONS} defaultValue={state.values.expectation ?? "answer"} />
      <AdminSelect name="expectedSection" label="Section it should cite" options={sectionOptions} defaultValue={state.values.expectedSection ?? initialSection} helperText="Only checked when the assistant answers from the policy." />
      <AdminField
        name="mustMention"
        label="Should mention"
        isOptional
        helperText={`Up to ${MAX_MENTION_PHRASES} short phrases the answer must include, separated by commas, like “$500, flat fee”. Capital letters don't matter.`}
        defaultValue={state.values.mustMention}
        error={state.fieldErrors.mustMention}
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

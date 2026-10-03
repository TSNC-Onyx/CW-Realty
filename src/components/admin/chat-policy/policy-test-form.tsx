"use client";

import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";

import { AdminField } from "@/components/admin/admin-field";
import { AdminSelect } from "@/components/admin/admin-select";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { getButtonClassName } from "@/components/ui/button-link";
import { addPolicyTestAction } from "@/lib/admin/chat-policy/actions";
import { getMatchingSection } from "@/lib/chat/policy-sections";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

export const OUTCOME_OPTIONS = [
  { value: "answer", label: "Answer from the policy" },
  { value: "handoff", label: "Hand off to a person" },
];

export const PRIVATE_SECTION_WARNING = "This section is private, so the assistant can't cite it; this test can't pass.";

/** privateSections: the draft's "(private)" headings, which a test can never cite. */
export function PolicyTestForm({ privateSections }: { privateSections: string[] }) {
  const [expectedSection, setExpectedSection] = useState("");
  const { state, isPending, formRef, handleSubmit } = useAdminForm(addPolicyTestAction, {
    problemAction: "chat_policy.add_test",
    onSuccess: () => {
      formRef.current?.reset();
      setExpectedSection("");
    },
  });
  const handleInput = (event: FormEvent<HTMLFormElement>) => setExpectedSection(String(new FormData(event.currentTarget).get("expectedSection") ?? ""));
  const isPrivateSection = expectedSection.trim() !== "" && getMatchingSection(privateSections, expectedSection) !== null;
  return (
    <form ref={formRef} onSubmit={handleSubmit} onInput={handleInput} noValidate className="grid max-w-form gap-6">
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
      {/* Always on the page, so screen readers announce the warning when it appears. */}
      <p role="status" className={isPrivateSection ? "type-small text-warning" : "sr-only"}>
        {isPrivateSection ? PRIVATE_SECTION_WARNING : ""}
      </p>
      <div>
        <button type="submit" aria-busy={isPending} className={getButtonClassName({ size: "m", variant: "main" })}>
          <Plus aria-hidden size={ICON_SIZE.button} />
          {isPending ? "Adding…" : "Add question"}
        </button>
      </div>
    </form>
  );
}

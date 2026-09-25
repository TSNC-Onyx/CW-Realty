import type { MouseEvent, Ref } from "react";

import { getFieldId } from "@/components/forms/form-field";
import { Message } from "@/components/ui/message";
import type { FieldErrors } from "@/lib/forms/form-state";
import type { FormFieldConfig } from "@/lib/forms/request-forms";

// Style §11.11: on submit with errors, a message at the top lists every problem as a
// link that jumps to its field; focus moves to this message.

type ErrorSummaryProps = {
  formId: string;
  fields: FormFieldConfig[];
  fieldErrors: FieldErrors;
  focusRef: Ref<HTMLDivElement>;
};

function handleJumpToField(event: MouseEvent<HTMLAnchorElement>, fieldId: string) {
  event.preventDefault();
  document.getElementById(fieldId)?.focus();
}

export function ErrorSummary({ formId, fields, fieldErrors, focusRef }: ErrorSummaryProps) {
  const fieldsWithErrors = fields.filter((field) => fieldErrors[field.name]);
  const count = fieldsWithErrors.length;
  const title = `Fix ${count} ${count === 1 ? "thing" : "things"} to send`;
  return (
    <Message tone="error" title={title} focusRef={focusRef}>
      <ul>
        {fieldsWithErrors.map((field) => {
          const fieldId = getFieldId(formId, field.name);
          return (
            <li key={field.name}>
              <a href={`#${fieldId}`} onClick={(event) => handleJumpToField(event, fieldId)} className="inline-flex min-h-11 items-center underline underline-offset-4">
                {fieldErrors[field.name]}
              </a>
            </li>
          );
        })}
      </ul>
    </Message>
  );
}

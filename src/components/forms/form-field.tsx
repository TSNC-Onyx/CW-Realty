import { Check, CircleAlert } from "lucide-react";
import type { ChangeEvent } from "react";

import { ICON_SIZE } from "@/lib/design/icon-sizes";
import type { FormFieldConfig } from "@/lib/forms/request-forms";

// Style §11.11 field: label above, "(optional)" marker, helper text, error beside the
// field (icon + words, linked by aria-describedby), and "Looks good" only after a fix.

const TEXTAREA_ROWS = 3;

type FormFieldProps = {
  formId: string;
  field: FormFieldConfig;
  value: string;
  error: string | null;
  isFixed: boolean;
  onValueChange: (name: string, value: string) => void;
  onFieldBlur: (name: string) => void;
};

export function getFieldId(formId: string, name: string): string {
  return `${formId}-${name}`;
}

function getDescribedBy(ids: (string | false)[]): string | undefined {
  const presentIds = ids.filter((id): id is string => Boolean(id));
  return presentIds.length > 0 ? presentIds.join(" ") : undefined;
}

export function FormField({ formId, field, value, error, isFixed, onValueChange, onFieldBlur }: FormFieldProps) {
  const inputId = getFieldId(formId, field.name);
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;
  const isValidShown = isFixed && !error;
  const inputProps = {
    id: inputId,
    name: field.name,
    value,
    autoComplete: field.autoComplete,
    className: "field-input",
    "aria-required": !field.isOptional,
    "aria-invalid": error ? true : undefined,
    "data-valid": isValidShown ? true : undefined,
    "aria-describedby": getDescribedBy([Boolean(field.helperText) && helperId, Boolean(error) && errorId]),
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onValueChange(field.name, event.target.value),
    onBlur: () => onFieldBlur(field.name),
  };

  return (
    <div>
      <label htmlFor={inputId} className="mb-1 block text-base font-bold">
        {field.label}
        {field.isOptional && <span className="font-regular text-muted"> (optional)</span>}
      </label>
      {field.kind === "textarea" ? <textarea rows={TEXTAREA_ROWS} {...inputProps} /> : <input type={field.kind} {...inputProps} />}
      {field.helperText && (
        <p id={helperId} className="type-small mt-1 text-muted">
          {field.helperText}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 flex items-start gap-2 text-sm leading-normal font-semibold text-error">
          <CircleAlert aria-hidden size={ICON_SIZE.inline} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
      {isValidShown && (
        <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-success">
          <Check aria-hidden size={ICON_SIZE.inline} />
          Looks good
        </p>
      )}
    </div>
  );
}

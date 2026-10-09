"use client";

import { CircleAlert } from "lucide-react";
import { useId, type ChangeEvent, type HTMLInputTypeAttribute } from "react";

import { SavedStateLine, getDescribedBy, useFieldSavedState, type SavedStateText } from "@/components/admin/saved-state";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Admin §1 / Style §11.11 field: plain label above a large input, "(optional)" marker,
// helper text, an error beside the field that names what to fix, and (inside a
// SavedStateProvider) whether the box matches what's saved.

const TEXTAREA_ROWS = 6;

export type AdminFieldProps = {
  name: string;
  label: string;
  defaultValue?: string;
  error?: string | null;
  helperText?: string;
  isOptional?: boolean;
  type?: HTMLInputTypeAttribute;
  isMultiline?: boolean;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email";
  maxLength?: number;
  /** For values the server stores in one letter case (IDs, emails, state, web addresses). */
  isCaseInsensitive?: boolean;
  savedStateText?: SavedStateText;
};

export function AdminField({
  name,
  label,
  defaultValue = "",
  error = null,
  helperText,
  isOptional = false,
  type = "text",
  isMultiline = false,
  autoComplete,
  inputMode,
  maxLength,
  isCaseInsensitive = false,
  savedStateText,
}: AdminFieldProps) {
  const inputId = useId();
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;
  const savedId = `${inputId}-saved`;
  const savedState = useFieldSavedState({ saved: defaultValue, isCaseInsensitive });
  const isSavedLineShown = savedState !== null && savedState.state !== "none";
  const describedBy = getDescribedBy([helperText && helperId, error && errorId, isSavedLineShown && savedId]);
  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => savedState?.setCurrent(event.target.value);
  const sharedProps = {
    id: inputId,
    name,
    defaultValue,
    autoComplete,
    inputMode,
    maxLength,
    className: "field-input",
    "aria-invalid": error ? true : undefined,
    "aria-required": !isOptional,
    "aria-describedby": describedBy,
    onChange: handleChange,
  };
  return (
    <div>
      <label htmlFor={inputId} className="mb-1 block text-base font-bold">
        {label}
        {isOptional && <span className="font-regular text-muted"> (optional)</span>}
      </label>
      {isMultiline ? <textarea rows={TEXTAREA_ROWS} {...sharedProps} /> : <input type={type} {...sharedProps} />}
      {helperText && (
        <p id={helperId} className="type-small mt-1 text-muted">
          {helperText}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 flex items-start gap-2 text-sm leading-normal font-semibold text-error">
          <CircleAlert aria-hidden size={ICON_SIZE.inline} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
      {savedState && <SavedStateLine id={savedId} state={savedState.state} current={savedState.current} getText={savedStateText} />}
    </div>
  );
}

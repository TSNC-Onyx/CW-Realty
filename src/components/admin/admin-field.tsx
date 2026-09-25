"use client";

import { CircleAlert } from "lucide-react";
import { useId, type HTMLInputTypeAttribute } from "react";

import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Admin §1 / Style §11.11 field: plain label above a large input, "(optional)" marker,
// helper text, and an error beside the field that names what to fix.

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
}: AdminFieldProps) {
  const inputId = useId();
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;
  const describedBy = [helperText ? helperId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
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
    </div>
  );
}

"use client";

import { useId } from "react";

export type SelectOption = { value: string; label: string };

type AdminSelectProps = { name: string; label: string; options: SelectOption[]; defaultValue: string; helperText?: string };

export function AdminSelect({ name, label, options, defaultValue, helperText }: AdminSelectProps) {
  const selectId = useId();
  return (
    <div>
      <label htmlFor={selectId} className="mb-1 block text-base font-bold">
        {label}
      </label>
      <select id={selectId} name={name} defaultValue={defaultValue} aria-describedby={helperText ? `${selectId}-helper` : undefined} className="field-input">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {helperText && (
        <p id={`${selectId}-helper`} className="type-small mt-1 text-muted">
          {helperText}
        </p>
      )}
    </div>
  );
}

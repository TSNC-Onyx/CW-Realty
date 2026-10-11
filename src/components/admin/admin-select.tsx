"use client";

import { useId } from "react";

import { SavedStateLine, getDescribedBy, useFieldSavedState } from "@/components/admin/saved-state";

export type SelectOption = { value: string; label: string };

type AdminSelectProps = { name: string; label: string; options: SelectOption[]; defaultValue: string; helperText?: string };

export function AdminSelect({ name, label, options, defaultValue, helperText }: AdminSelectProps) {
  const selectId = useId();
  const helperId = `${selectId}-helper`;
  const savedId = `${selectId}-saved`;
  const savedState = useFieldSavedState({ saved: defaultValue });
  const isSavedLineShown = savedState !== null && savedState.state !== "none";
  return (
    <div>
      <label htmlFor={selectId} className="mb-1 block text-base font-bold">
        {label}
      </label>
      <select
        id={selectId}
        name={name}
        defaultValue={defaultValue}
        onChange={(event) => savedState?.setCurrent(event.target.value)}
        aria-describedby={getDescribedBy([helperText && helperId, isSavedLineShown && savedId])}
        className="field-input"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {helperText && (
        <p id={helperId} className="type-small mt-1 text-muted">
          {helperText}
        </p>
      )}
      {savedState && <SavedStateLine id={savedId} state={savedState.state} />}
    </div>
  );
}

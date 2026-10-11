"use client";

import { useId } from "react";

import { SavedStateLine, getDescribedBy, useFieldSavedState } from "@/components/admin/saved-state";

type AdminCheckboxProps = { name: string; label: string; defaultChecked: boolean; helperText?: string };

// Ticked and unticked are both real saved choices, so neither reads as "Nothing saved".
const CHECKED = "checked";
const UNCHECKED = "unchecked";

function getCheckedValue(isChecked: boolean): string {
  return isChecked ? CHECKED : UNCHECKED;
}

// A 44px-tall checkbox row (Style §5) with its label on the right.
export function AdminCheckbox({ name, label, defaultChecked, helperText }: AdminCheckboxProps) {
  const checkboxId = useId();
  const helperId = `${checkboxId}-helper`;
  const savedId = `${checkboxId}-saved`;
  const savedState = useFieldSavedState({ saved: getCheckedValue(defaultChecked) });
  const isSavedLineShown = savedState !== null && savedState.state !== "none";
  return (
    <div>
      <label htmlFor={checkboxId} className="flex min-h-11 cursor-pointer items-center gap-3 text-base font-bold">
        <input
          id={checkboxId}
          type="checkbox"
          name={name}
          value="on"
          defaultChecked={defaultChecked}
          onChange={(event) => savedState?.setCurrent(getCheckedValue(event.target.checked))}
          className="size-6 accent-ink"
          aria-describedby={getDescribedBy([helperText && helperId, isSavedLineShown && savedId])}
        />
        {label}
      </label>
      {helperText && (
        <p id={helperId} className="type-small text-muted">
          {helperText}
        </p>
      )}
      {savedState && <SavedStateLine id={savedId} state={savedState.state} />}
    </div>
  );
}

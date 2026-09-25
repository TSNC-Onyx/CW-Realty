"use client";

import { useId } from "react";

type AdminCheckboxProps = { name: string; label: string; defaultChecked: boolean; helperText?: string };

// A 44px-tall checkbox row (Style §5) with its label on the right.
export function AdminCheckbox({ name, label, defaultChecked, helperText }: AdminCheckboxProps) {
  const checkboxId = useId();
  return (
    <div>
      <label htmlFor={checkboxId} className="flex min-h-11 cursor-pointer items-center gap-3 text-base font-bold">
        <input id={checkboxId} type="checkbox" name={name} value="on" defaultChecked={defaultChecked} className="size-6 accent-ink" aria-describedby={helperText ? `${checkboxId}-helper` : undefined} />
        {label}
      </label>
      {helperText && (
        <p id={`${checkboxId}-helper`} className="type-small text-muted">
          {helperText}
        </p>
      )}
    </div>
  );
}

import type { ReactNode } from "react";

// A labeled group of fields (Style §11.11: single column, 24px between fields).
export function AdminFieldset({ legend, description, children }: { legend: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="grid max-w-form gap-6 border-t-2 border-ink pt-6">
      <legend className="type-h3 float-left mb-1 w-full">{legend}</legend>
      {description && <p className="-mt-4 text-muted">{description}</p>}
      {children}
    </fieldset>
  );
}

import type { ReactNode } from "react";

// Short fields side by side from tablet width up (docs/admin-upload-layout-plan.md); one
// column on phones, as Style §11.11 asks.

const LAYOUT_CLASSES = {
  halves: "md:grid-cols-2",
  cityStateZip: "md:grid-cols-[2fr_1fr_1fr]",
} as const;

export type FieldRowLayout = keyof typeof LAYOUT_CLASSES;

export function AdminFieldRow({ layout = "halves", children }: { layout?: FieldRowLayout; children: ReactNode }) {
  return <div className={`grid gap-6 md:items-start md:gap-4 ${LAYOUT_CLASSES[layout]}`}>{children}</div>;
}

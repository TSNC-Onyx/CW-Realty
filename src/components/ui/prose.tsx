import type { ReactNode } from "react";

// Style §11.4 long text: 680px wide (about 70 characters), 16px between paragraphs,
// 32px above article subheadings.
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-prose space-y-4 [&_h2]:type-h2-article [&_h2]:pt-4 [&_li]:ml-6 [&_ul]:list-disc [&_ul]:space-y-2 [&_a]:font-semibold [&_a]:underline [&_a]:underline-offset-4">
      {children}
    </div>
  );
}

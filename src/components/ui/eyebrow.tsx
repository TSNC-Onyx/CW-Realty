import type { ReactNode } from "react";

import type { Tone } from "@/components/ui/button-link";

type EyebrowProps = { tone?: Tone; children: ReactNode };

// Style §11.2 eyebrow: uppercase label after a 32×2px rule (ink on light, gold on dark), 12px gap.
export function Eyebrow({ tone = "light", children }: EyebrowProps) {
  const ruleClass = tone === "dark" ? "bg-gold" : "bg-ink";
  return (
    <p className="type-eyebrow mb-4 flex items-center gap-3">
      <span aria-hidden className={`h-0.5 w-8 ${ruleClass}`} />
      {children}
    </p>
  );
}

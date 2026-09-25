import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { ICON_SIZE } from "@/lib/design/icon-sizes";

type CalloutProps = { icon: LucideIcon; children: ReactNode };

// Style §11.12 callout: dark panel, 22px gold icon, 17px white text.
export function Callout({ icon: Icon, children }: CalloutProps) {
  return (
    <div className="tone-dark flex items-start gap-3 px-6 py-4 text-md">
      <Icon aria-hidden size={ICON_SIZE.actionBar} className="mt-0.5 shrink-0 text-gold" />
      <div>{children}</div>
    </div>
  );
}

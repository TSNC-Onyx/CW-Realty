import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { ICON_SIZE } from "@/lib/design/icon-sizes";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  titleId: string;
  description: string;
  action: ReactNode;
};

// Style §11.13 empty state: dashed box, round dark badge with a gold icon, one main action.
export function EmptyState({ icon: Icon, title, titleId, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center border border-dashed border-field-border px-6 py-10 text-center">
      <span aria-hidden className="tone-dark mb-4 flex size-16 items-center justify-center rounded-full text-gold">
        <Icon size={ICON_SIZE.badge} />
      </span>
      <h2 id={titleId} className="font-display text-menu leading-snug font-medium tracking-heading">
        {title}
      </h2>
      <p className="mt-2 mb-6 max-w-empty text-base">{description}</p>
      {action}
    </div>
  );
}

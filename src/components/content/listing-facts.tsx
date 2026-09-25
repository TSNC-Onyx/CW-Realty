import { Bath, BedDouble, Maximize, type LucideIcon } from "lucide-react";

import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { getListingFacts, type ListingFactKind, type ListingSize } from "@/lib/content/format";

const FACT_ICONS: Record<ListingFactKind, LucideIcon> = { beds: BedDouble, baths: Bath, area: Maximize };

// Style §11.10 details row: beds, baths, square feet with 18px icons and 16px gaps.
export function ListingFacts(size: ListingSize) {
  const facts = getListingFacts(size);
  if (facts.length === 0) return null;
  return (
    <ul className="type-small flex flex-wrap gap-x-4 gap-y-1 text-muted">
      {facts.map(({ kind, label }) => {
        const Icon = FACT_ICONS[kind];
        return (
          <li key={kind} className="flex items-center gap-1.5">
            <Icon aria-hidden size={ICON_SIZE.inline} />
            {label}
          </li>
        );
      })}
    </ul>
  );
}

import { Camera, DoorOpen, FileText, House, ListChecks, type LucideIcon } from "lucide-react";

import { ICON_SIZE } from "@/lib/design/icon-sizes";
import type { AddOn, AddOnIcon } from "@/lib/content/selected-services";

// Style §11.10 add-on list: a 680px list under a 2px ink rule; icon, name, bold price, 1px line dividers.

const ADD_ON_ICONS: Record<AddOnIcon, LucideIcon> = { house: House, listing: ListChecks, camera: Camera, door: DoorOpen, document: FileText };

function AddOnRow({ addOn }: { addOn: AddOn }) {
  const Icon = ADD_ON_ICONS[addOn.icon];
  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-line py-4">
      <span className="flex items-center gap-3">
        <Icon aria-hidden size={ICON_SIZE.inline} className="shrink-0" />
        {addOn.name}
      </span>
      <span className="font-bold whitespace-nowrap">
        {addOn.price}
        {addOn.unit && <span className="type-small font-regular text-muted">{` ${addOn.unit}`}</span>}
      </span>
    </li>
  );
}

export function AddOnList({ headingId, note, addOns }: { headingId: string; note: string; addOns: AddOn[] }) {
  return (
    <div className="mt-12 max-w-prose md:mt-16">
      <h3 id={headingId} className="type-h3">Optional add-ons</h3>
      <p className="type-small mt-1 mb-4 text-muted">{note}</p>
      <ul className="border-t-2 border-ink">
        {addOns.map((addOn) => <AddOnRow key={addOn.name} addOn={addOn} />)}
      </ul>
    </div>
  );
}

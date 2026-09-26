import Link from "next/link";

import { AreaIcon } from "@/components/admin/frame/admin-area-icons";
import type { AreaStats } from "@/lib/admin/dashboard-figures";
import type { AdminArea } from "@/lib/admin/navigation";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Admin §1: every editable area as a labeled card; compact so four fit a desktop row.

function AreaCard({ area, status }: { area: AdminArea; status: string | undefined }) {
  return (
    <li>
      <Link href={area.href} className="group grid h-full content-start gap-2 border-t-2 border-ink bg-surface p-4">
        <span aria-hidden className="tone-dark flex size-10 items-center justify-center text-gold">
          <AreaIcon areaKey={area.key} size={ICON_SIZE.button} />
        </span>
        <h3 className="font-display text-xl leading-snug font-medium tracking-heading underline-offset-4 group-hover:underline">{area.label}</h3>
        <p className="text-tag leading-normal text-muted">{area.description}</p>
        {status && <p className="text-tag leading-normal font-bold">{status}</p>}
      </Link>
    </li>
  );
}

export function AreaCards({ areas, areaStats }: { areas: AdminArea[]; areaStats: AreaStats }) {
  return (
    <section aria-labelledby="areas-heading">
      <h2 id="areas-heading" className="type-h3 mb-4 border-b-2 border-ink pb-2">
        Manage the website
      </h2>
      <ul className="area-card-grid">
        {areas.map((area) => (
          <AreaCard key={area.key} area={area} status={areaStats[area.key]} />
        ))}
      </ul>
    </section>
  );
}

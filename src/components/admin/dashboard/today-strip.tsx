import { ArrowRight } from "lucide-react";
import Link from "next/link";

import type { TodayFigure } from "@/lib/admin/dashboard-figures";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Dark "Today" band: the few numbers that matter, each linking to its area. A figure that
// needs action turns gold and carries an arrow plus the words "needs attention" (never color alone).

function getColumnsClass(count: number): string {
  return count > 2 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2";
}

function Figure({ figure }: { figure: TodayFigure }) {
  return (
    <li className="bg-dark">
      <Link href={figure.href} className="group grid h-full content-start gap-1 p-4 md:p-6">
        <span className={`type-h2 leading-none tabular-nums ${figure.isActionNeeded ? "text-gold" : ""}`}>{figure.value}</span>
        <span className="flex items-center gap-2 text-sm font-bold underline-offset-4 group-hover:underline">
          {figure.label}
          {figure.isActionNeeded && (
            <>
              <span className="sr-only">(needs attention)</span>
              <ArrowRight aria-hidden size={ICON_SIZE.chevron} className="text-gold" />
            </>
          )}
        </span>
        <span className="text-tag leading-normal text-on-dark-muted">{figure.detail}</span>
      </Link>
    </li>
  );
}

export function TodayStrip({ figures }: { figures: TodayFigure[] }) {
  return (
    <section aria-labelledby="today-heading" className="tone-dark">
      <h2 id="today-heading" className="sr-only">
        Today
      </h2>
      <ul className={`grid gap-px bg-divider-dark ${getColumnsClass(figures.length)}`}>
        {figures.map((figure) => (
          <Figure key={figure.key} figure={figure} />
        ))}
      </ul>
    </section>
  );
}

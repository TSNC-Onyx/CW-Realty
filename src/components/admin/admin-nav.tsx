"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ADMIN_AREAS, isCurrentArea } from "@/lib/admin/navigation";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Area links for the signed-in role: a row on desktop, a disclosure on phones.
function getAreaLabel(label: string, key: string, unreadCount: number): string {
  return key === "inbox" && unreadCount > 0 ? `${label} (${unreadCount} new)` : label;
}

export function AdminNav({ areaKeys, unreadCount }: { areaKeys: string[]; unreadCount: number }) {
  const pathname = usePathname();
  const areas = ADMIN_AREAS.filter((area) => areaKeys.includes(area.key));
  const links = areas.map((area) => {
    const isCurrent = isCurrentArea(pathname, area);
    return (
      <li key={area.key}>
        <Link
          href={area.href}
          aria-current={isCurrent ? "page" : undefined}
          className={`flex min-h-11 items-center px-3 text-base font-semibold underline-offset-4 ${isCurrent ? "underline decoration-2" : ""}`}
        >
          {getAreaLabel(area.label, area.key, unreadCount)}
        </Link>
      </li>
    );
  });
  return (
    <nav aria-label="Admin">
      <ul className="hidden flex-wrap items-center gap-1 lg:flex">{links}</ul>
      <details className="lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-bold [&::-webkit-details-marker]:hidden">
          Admin menu
          <ChevronDown aria-hidden size={ICON_SIZE.chevron} />
        </summary>
        <ul className="grid py-2">{links}</ul>
      </details>
    </nav>
  );
}

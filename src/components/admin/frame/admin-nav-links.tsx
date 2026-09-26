"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AreaIcon } from "@/components/admin/frame/admin-area-icons";
import { UnreadBadge } from "@/components/admin/frame/unread-badge";
import { ADMIN_AREAS, ADMIN_AREA_GROUPS, isCurrentArea, type AdminArea } from "@/lib/admin/navigation";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Grouped admin links (Daily / Website / Settings) for the desktop sidebar and the phone
// menu. The current page gets the gold left bar used by the public mobile menu (§11.9).

export type AdminNavLayout = "sidebar" | "menu";

const LINK_CLASSES: Record<AdminNavLayout, string> = {
  sidebar: "nav-link-dark flex min-h-11 items-center gap-3 border-l-4 pr-5 pl-5 text-base font-semibold",
  menu: "nav-link-dark flex h-14 items-center gap-3 border-b border-l-4 border-b-divider-menu pr-4 pl-3 font-display text-xl font-medium",
};
const CURRENT_CLASS = "border-l-gold bg-dark-alt";
const IDLE_CLASS = "border-l-transparent";
const GROUP_HEADING_CLASSES: Record<AdminNavLayout, string> = { sidebar: "type-tag px-6 pb-2 text-gold", menu: "type-tag px-4 pb-2 text-gold" };

type AdminNavLinksProps = { areaKeys: string[]; unreadCount: number; layout: AdminNavLayout; onNavigate?: () => void };

type AreaLinkProps = { area: AdminArea; unreadCount: number; layout: AdminNavLayout; isCurrent: boolean; onNavigate?: () => void };

function AreaLink({ area, unreadCount, layout, isCurrent, onNavigate }: AreaLinkProps) {
  return (
    <li>
      <Link
        href={area.href}
        onClick={onNavigate}
        aria-current={isCurrent ? "page" : undefined}
        className={`${LINK_CLASSES[layout]} ${isCurrent ? CURRENT_CLASS : IDLE_CLASS}`}
      >
        <AreaIcon areaKey={area.key} size={ICON_SIZE.button} className="shrink-0" />
        <span className="flex-1">{area.label}</span>
        {area.key === "inbox" && <UnreadBadge count={unreadCount} />}
      </Link>
    </li>
  );
}

export function AdminNavLinks({ areaKeys, unreadCount, layout, onNavigate }: AdminNavLinksProps) {
  const pathname = usePathname();
  const areas = ADMIN_AREAS.filter((area) => areaKeys.includes(area.key));
  const groups = ADMIN_AREA_GROUPS.map((group) => ({ ...group, areas: areas.filter((area) => area.group === group.key) })).filter((group) => group.areas.length > 0);
  return (
    <nav aria-label="Admin">
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`admin-nav-${layout}-${group.key}`} className="pt-6">
          <h2 id={`admin-nav-${layout}-${group.key}`} className={GROUP_HEADING_CLASSES[layout]}>
            {group.label}
          </h2>
          <ul>
            {group.areas.map((area) => (
              <AreaLink key={area.key} area={area} unreadCount={unreadCount} layout={layout} isCurrent={isCurrentArea(pathname, area)} onNavigate={onNavigate} />
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

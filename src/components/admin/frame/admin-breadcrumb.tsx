"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ADMIN_HOME_PATH } from "@/lib/admin/paths";
import { getAreaForPath } from "@/lib/admin/navigation";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Top-bar breadcrumb on desktop: "Admin › Inbox". The area name is the current location;
// pages further down keep their own title and back link.
export function AdminBreadcrumb() {
  const pathname = usePathname();
  const area = getAreaForPath(pathname);
  if (!area) return null;
  return (
    <nav aria-label="Breadcrumb" className="hidden text-sm lg:block">
      <ol className="flex items-center gap-2 text-on-dark-muted">
        <li>
          <Link href={ADMIN_HOME_PATH} className="flex min-h-11 min-w-11 items-center px-1 underline underline-offset-4">
            Admin
          </Link>
        </li>
        <li aria-hidden>
          <ChevronRight size={ICON_SIZE.chevron} />
        </li>
        <li aria-current={pathname === area.href ? "page" : undefined} className="font-bold text-on-dark">
          {area.label}
        </li>
      </ol>
    </nav>
  );
}

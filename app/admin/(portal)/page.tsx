import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Message } from "@/components/ui/message";
import { fetchDashboardStats } from "@/lib/admin/dashboard";
import { getAreasForRole } from "@/lib/admin/navigation";
import { ALL_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

export const metadata: Metadata = { title: "Dashboard" };

type DashboardPageProps = { searchParams: Promise<{ notice?: string }> };

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { notice } = await searchParams;
  const admin = await requireAdminPage(ALL_ROLES);
  const areas = getAreasForRole(admin.role).filter((area) => area.key !== "dashboard");
  const stats = areas.length > 0 ? await fetchDashboardStats(admin) : {};
  return (
    <>
      <h1 className="type-h1 mb-2">Dashboard</h1>
      <p className="type-lead mb-8 text-muted">Choose what you want to update.</p>
      {notice === "role" && (
        <div className="mb-8 max-w-prose">
          <Message tone="warning" title="That area isn't part of your role">
            <p>Ask the site owner if you need access to it.</p>
          </Message>
        </div>
      )}
      {areas.length === 0 ? (
        <p className="max-w-prose">Your inbox will appear here once it is switched on. Nothing else needs your attention right now.</p>
      ) : (
        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {areas.map((area) => (
            <li key={area.key}>
              <Link href={area.href} className="group flex h-full flex-col border-t-2 border-ink bg-surface-soft p-6">
                <h2 className="type-h3 underline-offset-4 group-hover:underline">{area.label}</h2>
                <p className="mt-2 flex-1">{area.description}</p>
                <p className="type-small mt-4 text-muted">{stats[area.key]}</p>
                <span className="text-link mt-2">
                  {`Open ${area.label.toLowerCase()}`}
                  <ArrowRight aria-hidden size={ICON_SIZE.inline} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

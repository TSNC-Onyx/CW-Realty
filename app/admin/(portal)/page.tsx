import type { Metadata } from "next";

import { AreaCards } from "@/components/admin/dashboard/area-cards";
import { HealthNotices } from "@/components/admin/dashboard/health-notices";
import { LatestMessages } from "@/components/admin/dashboard/latest-messages";
import { ProblemsCard } from "@/components/admin/dashboard/problems-card";
import { QUICK_ACTIONS, QuickActions, type QuickAction } from "@/components/admin/dashboard/quick-actions";
import { TodayStrip } from "@/components/admin/dashboard/today-strip";
import { ButtonLink } from "@/components/ui/button-link";
import { Message } from "@/components/ui/message";
import { fetchDashboardSummary } from "@/lib/admin/dashboard";
import { getDateLine, getGreeting } from "@/lib/admin/dashboard-figures";
import { fetchOwnerHealth, type OwnerHealth } from "@/lib/admin/health/queries";
import { fetchLatestThreads } from "@/lib/admin/inbox/queries";
import type { LoadResult } from "@/lib/admin/load-result";
import { getAreasForRole, type AdminArea } from "@/lib/admin/navigation";
import { reportPageLoad } from "@/lib/admin/report-page-load";
import { ALL_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { isServiceAccessConfigured } from "@/lib/supabase/service-client";

export const metadata: Metadata = { title: "Dashboard" };

const LATEST_MESSAGE_COUNT = 5;
const DAILY_AREA_KEYS = new Set(["dashboard", "inbox"]);

type DashboardPageProps = { searchParams: Promise<{ notice?: string }> };

function getQuickActions(areas: AdminArea[]): QuickAction[] {
  return areas.flatMap((area) => QUICK_ACTIONS[area.key] ?? []);
}

function getHealthLoads(health: OwnerHealth | null): LoadResult<unknown>[] {
  return health ? [health.checks, health.problemCounts, health.problemRecipientCount] : [];
}

function SetupNotice() {
  return (
    <Message tone="error" title="Website forms can't save messages right now">
      <p>
        The live site is missing its private database key (<code>SUPABASE_SERVICE_ROLE_KEY</code>), so contact requests, invites, and photo uploads fail. Add it as a Cloudflare
        Worker secret. Only owners see this, and it disappears once the key is added.
      </p>
      <p className="mt-1">The problem log isn&apos;t saving — the site&apos;s service key is missing, so problems only reach the short-lived server log.</p>
    </Message>
  );
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { notice } = await searchParams;
  const admin = await requireAdminPage(ALL_ROLES);
  const now = new Date();
  const areas = getAreasForRole(admin.role).filter((area) => !DAILY_AREA_KEYS.has(area.key));
  const [summary, threads, health] = await Promise.all([fetchDashboardSummary(admin, now), fetchLatestThreads(admin, LATEST_MESSAGE_COUNT), fetchOwnerHealth(admin, now)]);
  const loadNotice = await reportPageLoad({ admin, action: "dashboard.load", results: [...summary.loads, threads, ...getHealthLoads(health)] });
  const quickActions = getQuickActions(areas);
  const isSetupIncomplete = admin.role === "owner" && !isServiceAccessConfigured();
  const emptyAction = areas.some((area) => area.key === "notifications") ? (
    <ButtonLink href="/admin/notifications" size="m" variant="main">
      Check who gets alerts
    </ButtonLink>
  ) : (
    <ButtonLink href="/admin/inbox" size="m" variant="main">
      Open the inbox
    </ButtonLink>
  );
  return (
    <div className="grid gap-10">
      <div className="grid gap-2">
        <p className="type-small text-muted">{getDateLine(now)}</p>
        <h1 className="type-h1">
          <span className="sr-only">Dashboard: </span>
          {getGreeting(now)}
        </h1>
      </div>
      {isSetupIncomplete && <SetupNotice />}
      {health && <HealthNotices checks={health.checks} problemRecipientCount={health.problemRecipientCount} now={now} notice={loadNotice} />}
      {notice === "role" && (
        <div className="max-w-prose">
          <Message tone="warning" title="That area isn't part of your role">
            <p>Ask the site owner if you need access to it.</p>
          </Message>
        </div>
      )}
      <TodayStrip figures={summary.today} />
      <div className="dashboard-split">
        <LatestMessages threads={threads} emptyAction={emptyAction} notice={loadNotice} />
        {(quickActions.length > 0 || health) && (
          <div className="grid content-start gap-6">
            {quickActions.length > 0 && <QuickActions actions={quickActions} />}
            {health && <ProblemsCard counts={health.problemCounts} />}
          </div>
        )}
      </div>
      {areas.length > 0 && <AreaCards areas={areas} areaStats={summary.areaStats} />}
    </div>
  );
}

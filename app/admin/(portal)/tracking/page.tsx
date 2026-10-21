import { CircleAlert, CircleCheck, Info, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";

import { LoadProblem } from "@/components/admin/load-problem";
import { TagReviewButton } from "@/components/admin/tracking/tag-review-button";
import { TrackingSettingsForm } from "@/components/admin/tracking/tracking-settings-form";
import { TextLink } from "@/components/ui/text-link";
import { getQueryLoad } from "@/lib/admin/load-result";
import { reportPageLoad, type LoadProblemNotice } from "@/lib/admin/report-page-load";
import { OWNER_ROLES, requireAdminPage, type AdminContext } from "@/lib/admin/require-admin";
import { checkSavedContainer, type ContainerCheck } from "@/lib/admin/tracking/container-check";
import { getMetaHealth, getStatusLines, type MetaCheckRow, type MetaHealth, type MetaProblemRow, type StatusLine, type TrackingSettingsRow } from "@/lib/admin/tracking/status-lines";
import { isTagReviewDue } from "@/lib/admin/tracking/tag-review";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Owner-only "Ads & analytics" (Features §3–4, plan decisions 6 and 16).

export const metadata: Metadata = { title: "Ads & analytics" };

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });

type LoadedPage = { isLoaded: true; row: TrackingSettingsRow | null; container: ContainerCheck; metaHealth: MetaHealth };

type TrackingPageState = LoadedPage | { isLoaded: false; notice: LoadProblemNotice | null };

const STATUS_ICONS: Record<StatusLine["kind"], { Icon: LucideIcon; className: string }> = {
  ready: { Icon: CircleCheck, className: "text-success" },
  attention: { Icon: CircleAlert, className: "text-muted" },
  info: { Icon: Info, className: "text-muted" },
};

function StatusIcon({ kind }: { kind: StatusLine["kind"] }) {
  const { Icon, className } = STATUS_ICONS[kind];
  return <Icon aria-hidden size={ICON_SIZE.inline} className={`mt-1 shrink-0 ${className}`} />;
}

function getReviewText(reviewedAt: string | null): string {
  const lastReview = reviewedAt ? `Last reviewed ${DATE_FORMAT.format(new Date(reviewedAt))}.` : "Not reviewed yet.";
  return isTagReviewDue({ reviewedAt, now: new Date() }) ? `${lastReview} A review is due.` : lastReview;
}

async function fetchTrackingSettings({ supabase, tenantId }: AdminContext) {
  const result = await supabase.from("tracking_settings").select("gtm_container_id, meta_pixel_id, tags_reviewed_at").eq("tenant_id", tenantId).maybeSingle<TrackingSettingsRow>();
  return getQueryLoad({ part: "tracking settings", result, empty: null });
}

async function fetchMetaCheck({ supabase, tenantId }: AdminContext) {
  const result = await supabase.from("health_checks").select("name, last_ok_at, last_error, last_error_at").eq("tenant_id", tenantId).eq("name", "meta_conversions").maybeSingle<MetaCheckRow>();
  return getQueryLoad({ part: "Meta connection check", result, empty: null });
}

async function fetchLastMetaProblem({ supabase, tenantId }: AdminContext) {
  const result = await supabase
    .from("problem_events")
    .select("occurred_at")
    .eq("tenant_id", tenantId)
    .eq("action", "tracking.meta_send")
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle<MetaProblemRow>();
  return getQueryLoad({ part: "last Meta send problem", result, empty: null });
}

// The settings come first: without them nothing else is shown. Then Google and the two Meta
// reads run together, so the page waits at most one 3-second check longer (plan R1, R6).
async function fetchPageState(admin: AdminContext): Promise<TrackingPageState> {
  const settings = await fetchTrackingSettings(admin);
  if (!settings.isLoaded) return { isLoaded: false, notice: await reportPageLoad({ admin, action: "tracking.load", results: [settings] }) };
  const [container, check, lastProblem] = await Promise.all([
    checkSavedContainer({ containerId: settings.data?.gtm_container_id ?? null, action: "tracking.load" }),
    fetchMetaCheck(admin),
    fetchLastMetaProblem(admin),
  ]);
  const notice = await reportPageLoad({ admin, action: "tracking.load", results: [settings, check, lastProblem] });
  return { isLoaded: true, row: settings.data, container, metaHealth: getMetaHealth({ check, lastProblem, notice }) };
}

function TrackingSettings({ row, container, metaHealth }: Omit<LoadedPage, "isLoaded">) {
  return (
    <>
      <ul className="mb-10 grid max-w-prose gap-2">
        {getStatusLines({ row, container, metaHealth }).map((line) => (
          <li key={line.label} className="flex items-start gap-2">
            <StatusIcon kind={line.kind} />
            {line.label}
          </li>
        ))}
      </ul>
      <section aria-labelledby="review-heading" className="mb-12 max-w-prose border-t-2 border-ink pt-6">
        <h2 id="review-heading" className="type-h3 mb-2">Quarterly tag review</h2>
        <p className="mb-4">{`Every 3 months, open Tag Manager, remove any tag you no longer use, and check that the Meta Pixel tag uses the same Pixel ID as below. ${getReviewText(row?.tags_reviewed_at ?? null)}`}</p>
        <TagReviewButton />
      </section>
      <TrackingSettingsForm defaults={{ gtmContainerId: row?.gtm_container_id ?? "", metaPixelId: row?.meta_pixel_id ?? "" }} />
    </>
  );
}

export default async function TrackingPage() {
  const admin = await requireAdminPage(OWNER_ROLES);
  const page = await fetchPageState(admin);
  return (
    <>
      <h1 className="type-h1 mb-2">Ads &amp; analytics</h1>
      <p className="type-lead mb-2 max-w-prose text-muted">Nothing tracks a visitor until they say yes in the cookie banner.</p>
      <div className="mb-8">
        <TextLink href="/privacy-policy#cookies" hasArrow>See what the privacy policy tells visitors</TextLink>
      </div>
      {/* No form without the saved settings: saving blanks would switch tracking off. */}
      {page.isLoaded ? <TrackingSettings row={page.row} container={page.container} metaHealth={page.metaHealth} /> : <LoadProblem notice={page.notice} title="The saved settings didn't load" />}
    </>
  );
}

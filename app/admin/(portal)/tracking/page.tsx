import { CircleAlert, CircleCheck, Info, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";

import { LoadProblem } from "@/components/admin/load-problem";
import { TagReviewButton } from "@/components/admin/tracking/tag-review-button";
import { TrackingSettingsForm } from "@/components/admin/tracking/tracking-settings-form";
import { TextLink } from "@/components/ui/text-link";
import { getQueryLoad } from "@/lib/admin/load-result";
import { reportPageLoad } from "@/lib/admin/report-page-load";
import { OWNER_ROLES, requireAdminPage, type AdminContext } from "@/lib/admin/require-admin";
import { checkSavedContainer, type ContainerCheck } from "@/lib/admin/tracking/container-check";
import { getStatusLines, type StatusLine, type TrackingSettingsRow } from "@/lib/admin/tracking/status-lines";
import { isTagReviewDue } from "@/lib/admin/tracking/tag-review";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Owner-only "Ads & analytics" (Features §3–4, plan decisions 6 and 16).

export const metadata: Metadata = { title: "Ads & analytics" };

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });

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

function TrackingSettings({ row, container }: { row: TrackingSettingsRow | null; container: ContainerCheck }) {
  return (
    <>
      <ul className="mb-10 grid max-w-prose gap-2">
        {getStatusLines({ row, container }).map((line) => (
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
  const settings = await fetchTrackingSettings(admin);
  const container = settings.isLoaded ? await checkSavedContainer({ containerId: settings.data?.gtm_container_id ?? null, action: "tracking.load" }) : null;
  const notice = await reportPageLoad({ admin, action: "tracking.load", results: [settings] });
  return (
    <>
      <h1 className="type-h1 mb-2">Ads &amp; analytics</h1>
      <p className="type-lead mb-2 max-w-prose text-muted">Nothing tracks a visitor until they say yes in the cookie banner.</p>
      <div className="mb-8">
        <TextLink href="/privacy-policy#cookies" hasArrow>See what the privacy policy tells visitors</TextLink>
      </div>
      {/* No form without the saved settings: saving blanks would switch tracking off. */}
      {settings.isLoaded ? <TrackingSettings row={settings.data} container={container} /> : <LoadProblem notice={notice} title="The saved settings didn't load" />}
    </>
  );
}

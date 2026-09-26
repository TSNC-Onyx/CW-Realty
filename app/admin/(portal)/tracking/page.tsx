import { CircleAlert, CircleCheck } from "lucide-react";
import type { Metadata } from "next";

import { TagReviewButton } from "@/components/admin/tracking/tag-review-button";
import { TrackingSettingsForm } from "@/components/admin/tracking/tracking-settings-form";
import { TextLink } from "@/components/ui/text-link";
import { OWNER_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { isTagReviewDue } from "@/lib/admin/tracking/tag-review";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { getTagServerOrigin } from "@/lib/tracking/tag-server";

// Owner-only "Ads & analytics" (Features §3–4, plan decisions 6 and 16).

export const metadata: Metadata = { title: "Ads & analytics" };

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });

type TrackingSettingsRow = { gtm_container_id: string | null; meta_pixel_id: string | null; tags_reviewed_at: string | null };

type StatusLine = { label: string; isReady: boolean };

function getMetaStatus(row: TrackingSettingsRow | null): StatusLine {
  if (!row?.meta_pixel_id) return { label: "Meta server connection: off (no Pixel ID)", isReady: false };
  if (!process.env.META_CAPI_ACCESS_TOKEN) return { label: "Meta server connection: waiting for the access token (your developer adds it to the website's settings)", isReady: false };
  return { label: "Meta server connection: on", isReady: true };
}

function getStatusLines(row: TrackingSettingsRow | null): StatusLine[] {
  const hasTagServer = getTagServerOrigin(process.env.TAG_SERVER_URL) !== null;
  return [
    { label: row?.gtm_container_id ? "Tracking: on after each visitor agrees" : "Tracking: off — visitors see no cookie banner", isReady: Boolean(row?.gtm_container_id) },
    getMetaStatus(row),
    { label: hasTagServer ? "Server-side tagging: on" : "Server-side tagging: off (optional)", isReady: hasTagServer },
  ];
}

function getReviewText(reviewedAt: string | null): string {
  const lastReview = reviewedAt ? `Last reviewed ${DATE_FORMAT.format(new Date(reviewedAt))}.` : "Not reviewed yet.";
  return isTagReviewDue({ reviewedAt, now: new Date() }) ? `${lastReview} A review is due.` : lastReview;
}

export default async function TrackingPage() {
  const { supabase, tenantId } = await requireAdminPage(OWNER_ROLES);
  const { data: row } = await supabase.from("tracking_settings").select("gtm_container_id, meta_pixel_id, tags_reviewed_at").eq("tenant_id", tenantId).maybeSingle<TrackingSettingsRow>();
  return (
    <>
      <h1 className="type-h1 mb-2">Ads &amp; analytics</h1>
      <p className="type-lead mb-2 max-w-prose text-muted">Nothing tracks a visitor until they say yes in the cookie banner.</p>
      <div className="mb-8">
        <TextLink href="/privacy-policy#cookies" hasArrow>See what the privacy policy tells visitors</TextLink>
      </div>
      <ul className="mb-10 grid max-w-prose gap-2">
        {getStatusLines(row).map((line) => (
          <li key={line.label} className="flex items-start gap-2">
            {line.isReady ? <CircleCheck aria-hidden size={ICON_SIZE.inline} className="mt-1 shrink-0 text-success" /> : <CircleAlert aria-hidden size={ICON_SIZE.inline} className="mt-1 shrink-0 text-muted" />}
            {line.label}
          </li>
        ))}
      </ul>
      <section aria-labelledby="review-heading" className="mb-12 max-w-prose border-t-2 border-ink pt-6">
        <h2 id="review-heading" className="type-h3 mb-2">Quarterly tag review</h2>
        <p className="mb-4">{`Every 3 months, open Tag Manager and remove any tag you no longer use. ${getReviewText(row?.tags_reviewed_at ?? null)}`}</p>
        <TagReviewButton />
      </section>
      <TrackingSettingsForm defaults={{ gtmContainerId: row?.gtm_container_id ?? "", metaPixelId: row?.meta_pixel_id ?? "" }} />
    </>
  );
}

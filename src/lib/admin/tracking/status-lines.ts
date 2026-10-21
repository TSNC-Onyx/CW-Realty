import "server-only";

import type { ContainerCheck } from "@/lib/admin/tracking/container-check";
import { getTagServerOrigin } from "@/lib/tracking/tag-server";

// The words the Ads & analytics page and its save message use for what is set up
// (docs/cwr-ads-analytics-fixes-plan.md, R1).

export type TrackingSettingsRow = { gtm_container_id: string | null; meta_pixel_id: string | null; tags_reviewed_at: string | null };

export type StatusLine = { label: string; isReady: boolean };

const OFF_MESSAGE = "Saved. Tracking is off, and visitors see no cookie banner.";
const ON_MESSAGE = "Saved. Visitors now see the cookie choices.";

function getTrackingStatus(container: ContainerCheck): StatusLine {
  if (!container) return { label: "Tracking: off — visitors see no cookie banner", isReady: false };
  if (container.status === "not_found") {
    return { label: `Tracking: not working — Google can't find a published container ${container.containerId}. Publish it in Tag Manager or check the ID.`, isReady: false };
  }
  if (container.status === "unknown") {
    return { label: "Tracking: on after each visitor agrees (we couldn't reach Google just now to confirm the container is published)", isReady: false };
  }
  return { label: "Tracking: on after each visitor agrees", isReady: true };
}

function getMetaStatus(row: TrackingSettingsRow | null): StatusLine {
  if (!row?.meta_pixel_id) return { label: "Meta server connection: off (no Pixel ID)", isReady: false };
  if (!process.env.META_CAPI_ACCESS_TOKEN) return { label: "Meta server connection: waiting for the access token (your developer adds it to the website's settings)", isReady: false };
  return { label: "Meta server connection: on", isReady: true };
}

export function getStatusLines({ row, container }: { row: TrackingSettingsRow | null; container: ContainerCheck }): StatusLine[] {
  const hasTagServer = getTagServerOrigin(process.env.TAG_SERVER_URL) !== null;
  return [
    getTrackingStatus(container),
    getMetaStatus(row),
    { label: hasTagServer ? "Server-side tagging: on" : "Server-side tagging: off (optional)", isReady: hasTagServer },
  ];
}

/** The message after a save; saving is never refused because of what Google said (D1). */
export function getSavedMessage(container: ContainerCheck): string {
  if (!container) return OFF_MESSAGE;
  if (container.status === "not_found") {
    return `Saved, but Google can't find a published container ${container.containerId}. Publish it in Tag Manager (Submit, then Publish) or check the ID. Until then nothing is recorded.`;
  }
  if (container.status === "unknown") return `${ON_MESSAGE} We couldn't reach Google to check the container — see the status at the top of the page.`;
  return ON_MESSAGE;
}

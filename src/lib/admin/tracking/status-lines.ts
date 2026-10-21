import "server-only";

import type { ContainerCheck } from "@/lib/admin/tracking/container-check";
import { getTagServerOrigin } from "@/lib/tracking/tag-server";

// The words the Ads & analytics page and its save message use for what is set up
// (docs/cwr-ads-analytics-fixes-plan.md, R1).

export type TrackingSettingsRow = { gtm_container_id: string | null; meta_pixel_id: string | null; tags_reviewed_at: string | null };

/** ready: working; attention: off or not working; info: an explanation, not a state. */
export type StatusLine = { label: string; kind: "ready" | "attention" | "info" };

const OFF_MESSAGE = "Saved. Tracking is off, and visitors see no cookie banner.";
const ON_MESSAGE = "Saved. Visitors now see the cookie choices.";

function getTrackingStatus(container: ContainerCheck): StatusLine {
  if (!container) return { label: "Tracking: off — visitors see no cookie banner", kind: "attention" };
  if (container.status === "not_found") {
    return { label: `Tracking: not working — Google can't find a published container ${container.containerId}. Publish it in Tag Manager or check the ID.`, kind: "attention" };
  }
  if (container.status === "unknown") {
    return { label: "Tracking: on after each visitor agrees (we couldn't reach Google just now to confirm the container is published)", kind: "attention" };
  }
  return { label: "Tracking: on after each visitor agrees", kind: "ready" };
}

function getMetaStatus(row: TrackingSettingsRow | null): StatusLine {
  if (!row?.meta_pixel_id) return { label: "Meta server connection: off (no Pixel ID)", kind: "attention" };
  if (!process.env.META_CAPI_ACCESS_TOKEN) return { label: "Meta server connection: waiting for the access token (your developer adds it to the website's settings)", kind: "attention" };
  return { label: "Meta server connection: on", kind: "ready" };
}

export function getStatusLines({ row, container }: { row: TrackingSettingsRow | null; container: ContainerCheck }): StatusLine[] {
  const hasTagServer = getTagServerOrigin(process.env.TAG_SERVER_URL) !== null;
  return [
    getTrackingStatus(container),
    getMetaStatus(row),
    { label: "Meta Pixel in visitors' browsers: set up inside Tag Manager, not on this page", kind: "info" },
    { label: hasTagServer ? "Server-side tagging: on" : "Server-side tagging: off (optional)", kind: hasTagServer ? "ready" : "attention" },
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

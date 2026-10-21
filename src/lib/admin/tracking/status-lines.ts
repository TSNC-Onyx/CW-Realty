import "server-only";

import type { LoadResult } from "@/lib/admin/load-result";
import type { LoadProblemNotice } from "@/lib/admin/report-page-load";
import type { ContainerCheck } from "@/lib/admin/tracking/container-check";
import { getTagServerOrigin } from "@/lib/tracking/tag-server";

// The words the Ads & analytics page and its save message use for what is set up
// (docs/cwr-ads-analytics-fixes-plan.md, R1, R6).

export type TrackingSettingsRow = { gtm_container_id: string | null; meta_pixel_id: string | null; tags_reviewed_at: string | null };

/** ready: working; attention: off or not working; info: an explanation, not a state. */
export type StatusLine = { label: string; kind: "ready" | "attention" | "info" };

export type MetaCheckRow = { name: string; last_ok_at: string | null; last_error: string | null; last_error_at: string | null };

export type MetaProblemRow = { occurred_at: string };

/** The meta_conversions check (null before the first lead) and the newest Meta send problem. */
export type MetaHealth = { isLoaded: true; check: MetaCheckRow | null; lastProblemAt: string | null } | { isLoaded: false; reference: string };

const DATE_TIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
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

function formatDateTime(stamp: string): string {
  return DATE_TIME.format(new Date(stamp));
}

// Failing: the last error is newer than the last success (the dashboard uses the same rule).
function isMetaCheckFailing(check: MetaCheckRow | null): check is MetaCheckRow & { last_error_at: string } {
  if (!check?.last_error_at) return false;
  return !check.last_ok_at || new Date(check.last_error_at) > new Date(check.last_ok_at);
}

function getFailingMetaStatus(check: MetaCheckRow & { last_error_at: string }): StatusLine {
  const reason = check.last_error ? ` (${check.last_error})` : "";
  const lastSuccess = check.last_ok_at ? ` Last success: ${formatDateTime(check.last_ok_at)}.` : "";
  return { label: `Meta server connection: not working — the last lead couldn't be sent on ${formatDateTime(check.last_error_at)}${reason}. Check the access token and the Pixel ID.${lastSuccess}`, kind: "attention" };
}

// Names one past try, never "the last": a success within a minute of an earlier one is not
// stamped, and grouped repeats may not each be stored (plan R6).
function getPassingFailureNote({ lastOkAt, lastProblemAt }: { lastOkAt: string | null; lastProblemAt: string | null }): string {
  if (!lastProblemAt) return "";
  if (lastOkAt && new Date(lastProblemAt) <= new Date(lastOkAt)) return "";
  return `. A try on ${formatDateTime(lastProblemAt)} didn't get through (Meta was busy or didn't answer); later leads try again.`;
}

function getMetaSendStatus({ check, lastProblemAt }: { check: MetaCheckRow | null; lastProblemAt: string | null }): StatusLine {
  if (isMetaCheckFailing(check)) return getFailingMetaStatus(check);
  const lastOkAt = check?.last_ok_at ?? null;
  const sent = lastOkAt ? `Meta server connection: on — last lead sent to Meta ${formatDateTime(lastOkAt)}` : "Meta server connection: on — no lead sent to Meta yet";
  return { label: `${sent}${getPassingFailureNote({ lastOkAt, lastProblemAt })}`, kind: "ready" };
}

function getMetaStatus({ row, metaHealth }: { row: TrackingSettingsRow | null; metaHealth: MetaHealth }): StatusLine {
  if (!row?.meta_pixel_id) return { label: "Meta server connection: off (no Pixel ID)", kind: "attention" };
  if (!process.env.META_CAPI_ACCESS_TOKEN) return { label: "Meta server connection: waiting for the access token (your developer adds it to the website's settings)", kind: "attention" };
  if (!metaHealth.isLoaded) return { label: `Meta server connection: this part didn't load (reference ${metaHealth.reference})`, kind: "attention" };
  return getMetaSendStatus(metaHealth);
}

/** What the page shows about Meta; a failed read shows the reference reportPageLoad recorded. */
export function getMetaHealth({ check, lastProblem, notice }: { check: LoadResult<MetaCheckRow | null>; lastProblem: LoadResult<MetaProblemRow | null>; notice: LoadProblemNotice | null }): MetaHealth {
  if (!check.isLoaded || !lastProblem.isLoaded) return { isLoaded: false, reference: notice?.reference ?? "" };
  return { isLoaded: true, check: check.data, lastProblemAt: lastProblem.data?.occurred_at ?? null };
}

export function getStatusLines({ row, container, metaHealth }: { row: TrackingSettingsRow | null; container: ContainerCheck; metaHealth: MetaHealth }): StatusLine[] {
  const hasTagServer = getTagServerOrigin(process.env.TAG_SERVER_URL) !== null;
  return [
    getTrackingStatus(container),
    getMetaStatus({ row, metaHealth }),
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

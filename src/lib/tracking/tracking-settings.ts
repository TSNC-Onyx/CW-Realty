import "server-only";

import { cache } from "react";
import { z } from "zod";

import { CWR_TENANT_SLUG, SupabaseQueryError, getPublicClient } from "@/lib/supabase/public-client";

// Tag Manager and Meta Pixel IDs entered by the owner in "Ads & analytics" (plan decision 6).

const TRACKING_SETTINGS_COLUMNS = "gtm_container_id, meta_pixel_id, tenants!inner(slug)";

const trackingSettingsRowSchema = z.object({
  gtm_container_id: z.string().nullable(),
  meta_pixel_id: z.string().nullable(),
});

export type TrackingSettings = { gtmContainerId: string | null; metaPixelId: string | null };

export const TRACKING_OFF: TrackingSettings = { gtmContainerId: null, metaPixelId: null };

async function fetchTrackingSettingsRow(): Promise<TrackingSettings> {
  const client = getPublicClient();
  if (!client) return TRACKING_OFF;
  const { data: row, error } = await client
    .from("tracking_settings")
    .select(TRACKING_SETTINGS_COLUMNS)
    .eq("tenants.slug", CWR_TENANT_SLUG)
    .maybeSingle();
  if (error) throw new SupabaseQueryError(error.message, { operation: "fetchTrackingSettings", cause: error });
  if (!row) return TRACKING_OFF;
  const parsed = trackingSettingsRowSchema.parse(row);
  return { gtmContainerId: parsed.gtm_container_id, metaPixelId: parsed.meta_pixel_id };
}

/** Fails closed: if the settings cannot be read, nothing tracks (Infra §3, Features §4). */
export const fetchTrackingSettings = cache(async (): Promise<TrackingSettings> => {
  try {
    return await fetchTrackingSettingsRow();
  } catch (error) {
    console.error(JSON.stringify({ message: "Tracking settings unavailable; tracking stays off", error: error instanceof Error ? error.name : "unknown" }));
    return TRACKING_OFF;
  }
});

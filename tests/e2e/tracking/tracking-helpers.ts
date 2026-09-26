import { createClient } from "@supabase/supabase-js";
import type { BrowserContext, Page } from "@playwright/test";

// Test-only helpers for the cookie banner: switch tracking on or off for the site, and stand
// in for Google Tag Manager so tests never contact Google.

export const TEST_CONTAINER_ID = "GTM-TEST123";

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    db: { schema: "cwr" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function setTrackingContainer(containerId: string | null): Promise<void> {
  const client = getServiceClient();
  const { data: tenant } = await client.from("tenants").select("id").eq("slug", "cwr").single();
  const { error } = await client.from("tracking_settings").update({ gtm_container_id: containerId, meta_pixel_id: null }).eq("tenant_id", tenant?.id);
  if (error) throw new Error(`Could not change tracking settings: ${error.message}`);
}

type SavedAttribution = { gclid: string | null; utm_source: string | null };

export async function fetchLeadAttribution(contactEmail: string): Promise<SavedAttribution | null> {
  const client = getServiceClient();
  const { data } = await client.from("inbox_threads").select("lead_attribution(gclid, utm_source)").eq("contact_email", contactEmail).maybeSingle<{ lead_attribution: SavedAttribution[] }>();
  return data?.lead_attribution[0] ?? null;
}

/** Records every request to Google or Meta and answers Tag Manager with an empty script. */
export async function watchTrackerRequests(context: BrowserContext): Promise<string[]> {
  const requests: string[] = [];
  await context.route(/googletagmanager\.com|google-analytics\.com|facebook\.(com|net)|doubleclick\.net/, async (route) => {
    requests.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
  });
  return requests;
}

/** The data layer, with gtag() commands (Arguments objects) turned into plain lists. */
export async function getDataLayer(page: Page): Promise<unknown[]> {
  return page.evaluate(() => {
    const entries = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
    return entries.map((entry) => (Object.prototype.toString.call(entry) === "[object Arguments]" ? Array.from(entry as ArrayLike<unknown>) : entry));
  });
}

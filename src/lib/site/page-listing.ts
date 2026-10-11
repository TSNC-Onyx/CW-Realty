import { cache } from "react";

import { CWR_TENANT_SLUG, SupabaseQueryError, getPublicClient } from "@/lib/supabase/public-client";
import type { PageListing } from "@/lib/site/navigation";

// Owner page switches (docs/cwr-connections-page-switch-plan.md), read apart from the contact
// details so a problem here (or a release that reaches the website before its database update)
// never hides the phone number. Fails to "every page listed", which is the site as it was.

const ALL_PAGES_LISTED: PageListing = { isConnectionsPageVisible: true };

async function fetchPageListingRow(): Promise<PageListing> {
  const client = getPublicClient();
  if (!client) return ALL_PAGES_LISTED;
  const { data: row, error } = await client
    .from("site_settings")
    .select("is_connections_page_visible, tenants!inner(slug)")
    .eq("tenants.slug", CWR_TENANT_SLUG)
    .maybeSingle<{ is_connections_page_visible: boolean }>();
  if (error) throw new SupabaseQueryError(error.message, { operation: "fetchPageListing", cause: error });
  return { isConnectionsPageVisible: row?.is_connections_page_visible !== false };
}

export const fetchPageListing = cache(async (): Promise<PageListing> => {
  try {
    return await fetchPageListingRow();
  } catch (error) {
    console.error(JSON.stringify({ message: "Page switches unavailable; every page stays listed", error: error instanceof Error ? error.name : "unknown" }));
    return ALL_PAGES_LISTED;
  }
});

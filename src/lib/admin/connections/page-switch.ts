import { getLoaded, getQueryLoad, type LoadResult } from "@/lib/admin/load-result";
import type { AdminContext } from "@/lib/admin/require-admin";

// The Connections page switch on Admin → Connections (docs/cwr-connections-page-switch-plan.md):
// whether the page shows, and whether the published chatbot policy still mentions it.

const CONNECTIONS_MENTION = /connections page|\/connections\b/i;

export type ConnectionsPageSwitch = { isVisible: boolean; isMentionedInChatPolicy: boolean };

type SwitchRow = { is_connections_page_visible: boolean };

/** True when chatbot policy text sends visitors to the Connections page (by name or address). */
export function getIsConnectionsPageMentioned(policyBody: string): boolean {
  return CONNECTIONS_MENTION.test(policyBody);
}

async function fetchIsMentionedInChatPolicy({ supabase, tenantId }: AdminContext): Promise<boolean> {
  const { data, error } = await supabase.from("chat_policies").select("body").eq("tenant_id", tenantId).eq("status", "published").maybeSingle<{ body: string }>();
  // A reminder only: if the policy can't be read (a manager, or a failed query), it isn't shown.
  if (error) return false;
  return getIsConnectionsPageMentioned(data?.body ?? "");
}

export async function fetchConnectionsPageSwitch(admin: AdminContext): Promise<LoadResult<ConnectionsPageSwitch>> {
  const [result, isMentionedInChatPolicy] = await Promise.all([
    admin.supabase.from("site_settings").select("is_connections_page_visible").eq("tenant_id", admin.tenantId).maybeSingle<SwitchRow>(),
    fetchIsMentionedInChatPolicy(admin),
  ]);
  const load = getQueryLoad({ part: "Connections page switch", result, empty: null });
  if (!load.isLoaded) return load;
  return getLoaded({ isVisible: load.data?.is_connections_page_visible !== false, isMentionedInChatPolicy });
}

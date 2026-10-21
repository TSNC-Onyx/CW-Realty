import "server-only";

import type { AdminContext } from "@/lib/admin/require-admin";
import { isSiteEmailConfigured } from "@/lib/email-outbox/site-email-settings";

// What the admin pages say about email (docs/cwr-email-outbox-plan.md). Before cutover the
// site sends, so "set up" means the site has MailerSend settings and problem emails are
// paused. After cutover the email-worker sends: "set up" comes from its own health record.

export type EmailStatus = { isOutboxLive: boolean; isSendingSetUp: boolean };

export async function fetchEmailStatus({ supabase, tenantId }: Pick<AdminContext, "supabase" | "tenantId">): Promise<EmailStatus> {
  const [live, ready] = await Promise.all([
    supabase.rpc("is_email_outbox_live", { p_tenant_id: tenantId }),
    supabase.rpc("is_email_sending_ready", { p_tenant_id: tenantId }),
  ]);
  // If the switch can't be read, the pages keep the old (pre-outbox) wording.
  const isOutboxLive = !live.error && live.data === true;
  if (!isOutboxLive) return { isOutboxLive, isSendingSetUp: isSiteEmailConfigured() };
  return { isOutboxLive, isSendingSetUp: ready.error ? true : ready.data !== false };
}

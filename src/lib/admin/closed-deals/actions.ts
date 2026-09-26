"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getClosedDealSchema, type ClosedDealInput } from "@/lib/admin/closed-deals/closed-deal-schema";
import { getDatabaseErrorMessage } from "@/lib/admin/database-errors";
import { getQuickError, getQuickSuccess, type QuickResult } from "@/lib/admin/quick-result";
import { EDITOR_ROLES } from "@/lib/admin/require-admin";
import { runQuickAction } from "@/lib/admin/run-quick-action";

// Owners and managers record a closed deal on a conversation. Saving again corrects it, and
// also brings back one that was moved to the trash (one deal per conversation).

export async function saveClosedDealAction(threadId: string, input: ClosedDealInput): Promise<QuickResult> {
  return runQuickAction(EDITOR_ROLES, async ({ supabase, tenantId, userId }) => {
    const id = z.uuid().parse(threadId);
    const parsed = getClosedDealSchema(new Date()).safeParse(input);
    if (!parsed.success) return getQuickError(parsed.error.issues[0]?.message ?? "Check the closing date and price");
    const row = { tenant_id: tenantId, thread_id: id, closed_on: parsed.data.closedOn, value_cents: parsed.data.salePrice, recorded_by: userId, deleted_at: null };
    const { error } = await supabase.from("closed_deals").upsert(row, { onConflict: "thread_id" });
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    revalidatePath(`/admin/inbox/${id}`);
    revalidatePath("/admin/closed-deals");
    return getQuickSuccess("Closed deal saved. It's in the Closed deals downloads.");
  });
}

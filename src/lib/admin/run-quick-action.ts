import "server-only";

import { unstable_rethrow } from "next/navigation";

import { getQuickError, type QuickResult } from "@/lib/admin/quick-result";
import { AdminAccessError, requireAdmin, type AdminContext, type AdminRole } from "@/lib/admin/require-admin";

// Boundary for one-click admin actions: role check first, plain messages out.
export async function runQuickAction(allowedRoles: AdminRole[], work: (admin: AdminContext) => Promise<QuickResult>): Promise<QuickResult> {
  try {
    return await work(await requireAdmin(allowedRoles));
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AdminAccessError) return getQuickError(error.message);
    console.error("Admin quick action failed", error);
    return getQuickError("That didn't work. Refresh the page and try again.");
  }
}

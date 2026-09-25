import "server-only";

import { unstable_rethrow } from "next/navigation";

import { getErrorState, type ActionState } from "@/lib/admin/action-state";
import { DuplicateSubmitError } from "@/lib/admin/idempotency";
import { AdminAccessError, requireAdmin, type AdminContext, type AdminRole } from "@/lib/admin/require-admin";

// Boundary for every admin server action: checks the caller's role first, turns a wrong
// role into a plain message, and logs unexpected failures instead of showing internals.

const UNEXPECTED_MESSAGE = "Something went wrong. Your changes were not saved. Try again in a moment.";

export async function runAdminAction(allowedRoles: AdminRole[], work: (admin: AdminContext) => Promise<ActionState>): Promise<ActionState> {
  try {
    const admin = await requireAdmin(allowedRoles);
    return await work(admin);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AdminAccessError || error instanceof DuplicateSubmitError) return getErrorState({ message: error.message });
    console.error("Admin action failed", error);
    return getErrorState({ message: UNEXPECTED_MESSAGE });
  }
}

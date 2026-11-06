import "server-only";

import { z } from "zod";

import { getDatabaseErrorMessage } from "@/lib/admin/database-errors";
import { getQuickError, getQuickSuccess, type QuickResult } from "@/lib/admin/quick-result";
import type { AdminContext } from "@/lib/admin/require-admin";
import { personNameSchema } from "@/lib/admin/users/name-schema";
import { noteProblemCause } from "@/lib/observability/action-context";

// An owner adds or corrects the name of someone with access here, their own included
// (owner choice 2026-11-05). Only the two name keys are sent; Auth keeps the rest of
// user_metadata. The person must have a membership in this tenant first.

type AuthRefusal = { code?: string; name: string; message: string };

/** auth.admin.updateUserById, passed in so this can be tested without Supabase. */
export type UpdateUser = (userId: string, attributes: { user_metadata: { first_name: string; last_name: string } }) => Promise<{ error: AuthRefusal | null }>;

export type NameSaveDeps = Pick<AdminContext, "supabase" | "tenantId"> & { updateUser: UpdateUser };

export type NameChange = { userId: string; firstName: string; lastName: string };

export async function saveName({ supabase, tenantId, updateUser }: NameSaveDeps, change: NameChange): Promise<QuickResult> {
  const userId = z.uuid().parse(change.userId);
  const firstName = personNameSchema.safeParse(change.firstName);
  const lastName = personNameSchema.safeParse(change.lastName);
  if (!firstName.success || !lastName.success) return getQuickError("Enter a first and last name of up to 100 characters.");

  const { data: membership, error: lookupError } = await supabase.from("memberships").select("id").eq("tenant_id", tenantId).eq("user_id", userId);
  if (lookupError) return getQuickError(getDatabaseErrorMessage(lookupError));
  if (!membership?.length) return getQuickError("That person no longer has access here.");

  const { error } = await updateUser(userId, { user_metadata: { first_name: firstName.data, last_name: lastName.data } });
  if (error) {
    // The sign-in service failed: a system fault, not something the owner typed.
    noteProblemCause({ stage: "external", severity: "error", code: error.code ?? error.name, detail: error.message });
    return getQuickError("The name couldn't be saved. Try again.");
  }
  return getQuickSuccess("Name saved.");
}

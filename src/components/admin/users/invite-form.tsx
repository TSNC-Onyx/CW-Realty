"use client";

import { Send } from "lucide-react";

import { AdminField } from "@/components/admin/admin-field";
import { AdminSelect } from "@/components/admin/admin-select";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { useIdempotencyKey } from "@/components/admin/use-idempotency-key";
import { getButtonClassName } from "@/components/ui/button-link";
import { ROLE_OPTIONS } from "@/components/admin/users/role-options";
import { inviteUserAction } from "@/lib/admin/users/actions";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

export function InviteForm({ idempotencyKey }: { idempotencyKey: string }) {
  const { state, isPending, formRef, handleSubmit } = useAdminForm(inviteUserAction, {
    onSuccess: () => formRef.current?.reset(),
  });
  const key = useIdempotencyKey(idempotencyKey, state);
  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="grid max-w-form gap-6">
      <input type="hidden" name="idempotencyKey" value={key} />
      <AdminField name="email" label="Email" type="email" error={state.fieldErrors.email} />
      <AdminSelect name="role" label="Role" options={ROLE_OPTIONS} defaultValue="manager" helperText="Managers edit listings, team, and contact details. Staff answer their assigned inbox messages. Owners can do everything." />
      <div>
        <button type="submit" aria-busy={isPending} className={getButtonClassName({ size: "m", variant: "main" })}>
          <Send aria-hidden size={ICON_SIZE.button} />
          {isPending ? "Sending…" : "Send invite"}
        </button>
      </div>
    </form>
  );
}

"use client";

import { UserPlus } from "lucide-react";
import { useId } from "react";

import { AdminField } from "@/components/admin/admin-field";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { getButtonClassName } from "@/components/ui/button-link";
import { SOURCE_LABELS, type InboxSource } from "@/lib/admin/inbox/inbox-labels";
import { addRecipientAction } from "@/lib/admin/notifications/actions";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

const SOURCES = Object.keys(SOURCE_LABELS) as InboxSource[];

export function RecipientForm() {
  const legendId = useId();
  const { state, isPending, formRef, handleSubmit } = useAdminForm(addRecipientAction, { onSuccess: () => formRef.current?.reset() });
  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="grid max-w-form gap-6">
      <AdminField name="fullName" label="Name" defaultValue={state.values.fullName} error={state.fieldErrors.fullName} />
      <AdminField name="email" label="Email" type="email" defaultValue={state.values.email} error={state.fieldErrors.email} />
      <fieldset aria-describedby={state.fieldErrors.alertSources ? `${legendId}-error` : undefined}>
        <legend id={legendId} className="mb-1 text-base font-bold">
          Send alerts for
        </legend>
        {SOURCES.map((source) => (
          <label key={source} className="flex min-h-11 cursor-pointer items-center gap-3">
            <input type="checkbox" name="alertSources" value={source} defaultChecked className="size-6 accent-ink" />
            {SOURCE_LABELS[source]}
          </label>
        ))}
        {state.fieldErrors.alertSources && (
          <p id={`${legendId}-error`} className="text-sm font-semibold text-error">
            {state.fieldErrors.alertSources}
          </p>
        )}
      </fieldset>
      <div>
        <button type="submit" aria-busy={isPending} className={getButtonClassName({ size: "m", variant: "main" })}>
          <UserPlus aria-hidden size={ICON_SIZE.button} />
          {isPending ? "Adding…" : "Add person"}
        </button>
      </div>
    </form>
  );
}

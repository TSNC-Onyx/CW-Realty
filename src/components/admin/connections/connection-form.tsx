"use client";

import { Fragment } from "react";

import { ConnectionFields, type ConnectionDefaults } from "@/components/admin/connections/connection-fields";
import { getConnectionPreviewValues, type ConnectionPreviewValues } from "@/components/admin/connections/connection-preview";
import { SaveBar } from "@/components/admin/save-bar";
import { SavedStateProvider } from "@/components/admin/saved-state";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { updateConnectionAction } from "@/lib/admin/connections/actions";

// Edit a partner's details. Adding a partner is NewConnectionForm (details and photo together).

type ConnectionFormProps = { connectionId: string; defaults: ConnectionDefaults; onPreviewChange: (values: ConnectionPreviewValues) => void };

export function ConnectionForm({ connectionId, defaults, onPreviewChange }: ConnectionFormProps) {
  const { state, isPending, isDirty, savedVersion, formRef, handleSubmit, handleInput } = useAdminForm(updateConnectionAction, { problemAction: "connections.update" });

  const handleFormInput = () => {
    handleInput();
    if (formRef.current) onPreviewChange(getConnectionPreviewValues(formRef.current));
  };

  return (
    <SavedStateProvider isNewItem={false}>
      <form ref={formRef} onSubmit={handleSubmit} onInput={handleFormInput} noValidate className="grid gap-12">
        {/* Restarts the fields from the stored values after each save; the Save bar keeps focus. */}
        <Fragment key={savedVersion}>
          <input type="hidden" name="connectionId" value={connectionId} />
          <ConnectionFields defaults={defaults} errors={state.fieldErrors} />
        </Fragment>
        <SaveBar isPending={isPending} isDirty={isDirty} label="Save changes" />
      </form>
    </SavedStateProvider>
  );
}

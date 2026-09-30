"use client";

import { AdminCheckbox } from "@/components/admin/admin-checkbox";
import { AdminField } from "@/components/admin/admin-field";
import { AdminFieldset } from "@/components/admin/admin-fieldset";
import { AdminSelect } from "@/components/admin/admin-select";
import { SaveBar } from "@/components/admin/save-bar";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { useIdempotencyKey } from "@/components/admin/use-idempotency-key";
import { createConnectionAction, updateConnectionAction } from "@/lib/admin/connections/actions";
import { CONNECTION_CATEGORIES } from "@/lib/content/connection-categories";

export type ConnectionDefaults = {
  fullName: string;
  category: string;
  titleLine: string;
  phone: string;
  email: string;
  website: string;
  isVisible: boolean;
};

type ConnectionFormProps =
  | { mode: "create"; idempotencyKey: string; defaults: ConnectionDefaults }
  | { mode: "edit"; connectionId: string; defaults: ConnectionDefaults };

const CATEGORY_OPTIONS = CONNECTION_CATEGORIES.map((category) => ({ value: category, label: category }));

export function ConnectionForm(props: ConnectionFormProps) {
  const action = props.mode === "create" ? createConnectionAction : updateConnectionAction;
  const { state, isPending, isDirty, formRef, handleSubmit, handleInput } = useAdminForm(action, { problemAction: props.mode === "create" ? "connections.create" : "connections.update" });
  const idempotencyKey = useIdempotencyKey(props.mode === "create" ? props.idempotencyKey : "", state);
  const { defaults } = props;
  const errors = state.fieldErrors;
  return (
    <form ref={formRef} onSubmit={handleSubmit} onInput={handleInput} noValidate className="grid gap-12">
      {props.mode === "create" ? <input type="hidden" name="idempotencyKey" value={idempotencyKey} /> : <input type="hidden" name="connectionId" value={props.connectionId} />}
      <AdminFieldset legend="Partner">
        <AdminField name="fullName" label="Full name" defaultValue={defaults.fullName} error={errors.fullName} />
        <AdminSelect name="category" label="Category" options={CATEGORY_OPTIONS} defaultValue={defaults.category} helperText="The Connections page labels each partner with their category." />
        <AdminField name="titleLine" label="Title or license" isOptional defaultValue={defaults.titleLine} error={errors.titleLine} helperText="For example: Loan officer, NMLS 86956." />
      </AdminFieldset>
      <AdminFieldset legend="Contact" description="Shown on the Connections page. Leave blank to hide.">
        <AdminField name="phone" label="Phone" type="tel" isOptional defaultValue={defaults.phone} error={errors.phone} />
        <AdminField name="email" label="Email" type="email" isOptional defaultValue={defaults.email} error={errors.email} />
        <AdminField name="website" label="Website" type="url" isOptional defaultValue={defaults.website} error={errors.website} helperText="The full address, starting with https://" />
      </AdminFieldset>
      <AdminFieldset legend="On the website">
        <AdminCheckbox name="isVisible" label="Show on the Connections page" defaultChecked={defaults.isVisible} helperText="Hiding keeps the partner here for later." />
      </AdminFieldset>
      <SaveBar isPending={isPending} isDirty={isDirty} label={props.mode === "create" ? "Add connection" : "Save changes"} />
    </form>
  );
}

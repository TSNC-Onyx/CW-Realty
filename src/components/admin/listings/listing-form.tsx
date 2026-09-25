"use client";

import { AdminField } from "@/components/admin/admin-field";
import { AdminFieldset } from "@/components/admin/admin-fieldset";
import { SaveBar } from "@/components/admin/save-bar";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { useIdempotencyKey } from "@/components/admin/use-idempotency-key";
import { createListingAction, updateListingAction } from "@/lib/admin/listings/actions";
import type { ListingDefaults } from "@/lib/admin/listings/mappers";

type ListingFormProps =
  | { mode: "create"; idempotencyKey: string; defaults: ListingDefaults }
  | { mode: "edit"; listingId: string; defaults: ListingDefaults };

export function ListingForm(props: ListingFormProps) {
  const action = props.mode === "create" ? createListingAction : updateListingAction;
  const { state, isPending, isDirty, formRef, handleSubmit, handleInput } = useAdminForm(action);
  const idempotencyKey = useIdempotencyKey(props.mode === "create" ? props.idempotencyKey : "", state);
  const { defaults } = props;
  const errors = state.fieldErrors;
  return (
    <form ref={formRef} onSubmit={handleSubmit} onInput={handleInput} noValidate className="grid gap-12">
      {props.mode === "create" ? <input type="hidden" name="idempotencyKey" value={idempotencyKey} /> : <input type="hidden" name="listingId" value={props.listingId} />}
      <AdminFieldset legend="Address">
        <AdminField name="streetAddress" label="Street address" autoComplete="off" defaultValue={defaults.streetAddress} error={errors.streetAddress} />
        <AdminField name="city" label="City" defaultValue={defaults.city} error={errors.city} />
        <AdminField name="state" label="State" maxLength={2} defaultValue={defaults.state} error={errors.state} />
        <AdminField name="postalCode" label="ZIP code" inputMode="numeric" maxLength={5} defaultValue={defaults.postalCode} error={errors.postalCode} />
      </AdminFieldset>
      <AdminFieldset legend="Price and size">
        <AdminField name="price" label="Price" inputMode="decimal" defaultValue={defaults.price} error={errors.price} helperText="In dollars, like 225,000." />
        <AdminField name="bedrooms" label="Bedrooms" inputMode="numeric" isOptional defaultValue={defaults.bedrooms} error={errors.bedrooms} />
        <AdminField name="bathrooms" label="Bathrooms" inputMode="decimal" isOptional defaultValue={defaults.bathrooms} error={errors.bathrooms} helperText="Use .5 for a half bath, like 2.5." />
        <AdminField name="squareFeet" label="Square feet" inputMode="numeric" isOptional defaultValue={defaults.squareFeet} error={errors.squareFeet} />
      </AdminFieldset>
      <AdminFieldset legend="Description">
        <AdminField name="description" label="About this property" isMultiline defaultValue={defaults.description} error={errors.description} helperText="Leave a blank line between paragraphs." />
      </AdminFieldset>
      <AdminFieldset legend="Web address">
        <AdminField
          name="slug"
          label="Web address"
          isOptional={props.mode === "create"}
          defaultValue={defaults.slug}
          error={errors.slug}
          helperText="charliewardrealty.com/listings/… Filled in from the address if left blank. Changing it later keeps the old address working."
        />
      </AdminFieldset>
      <SaveBar isPending={isPending} isDirty={isDirty} label={props.mode === "create" ? "Save as draft" : "Save changes"} />
    </form>
  );
}

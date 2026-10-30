import { AdminField } from "@/components/admin/admin-field";
import { AdminFieldRow } from "@/components/admin/admin-field-row";
import { AdminFieldset } from "@/components/admin/admin-fieldset";
import type { FieldErrors } from "@/lib/admin/action-state";
import type { ListingDefaults } from "@/lib/admin/listings/mappers";

// The listing's details, shared by Add and Edit; short fields sit side by side
// (docs/admin-upload-layout-plan.md).

type ListingFieldsProps = { defaults: ListingDefaults; errors: FieldErrors; isNewListing: boolean };

export function ListingFields({ defaults, errors, isNewListing }: ListingFieldsProps) {
  return (
    <>
      <AdminFieldset legend="Address">
        <AdminField name="streetAddress" label="Street address" autoComplete="off" defaultValue={defaults.streetAddress} error={errors.streetAddress} />
        <AdminFieldRow layout="cityStateZip">
          <AdminField name="city" label="City" defaultValue={defaults.city} error={errors.city} />
          <AdminField name="state" isCaseInsensitive label="State" maxLength={2} defaultValue={defaults.state} error={errors.state} />
          <AdminField name="postalCode" label="ZIP code" inputMode="numeric" maxLength={5} defaultValue={defaults.postalCode} error={errors.postalCode} />
        </AdminFieldRow>
      </AdminFieldset>
      <AdminFieldset legend="Price and size">
        <AdminFieldRow>
          <AdminField name="price" label="Price" inputMode="decimal" defaultValue={defaults.price} error={errors.price} helperText="In dollars, like 225,000." />
          <AdminField name="squareFeet" label="Square feet" inputMode="numeric" isOptional defaultValue={defaults.squareFeet} error={errors.squareFeet} />
        </AdminFieldRow>
        <AdminFieldRow>
          <AdminField name="bedrooms" label="Bedrooms" inputMode="numeric" isOptional defaultValue={defaults.bedrooms} error={errors.bedrooms} />
          <AdminField name="bathrooms" label="Bathrooms" inputMode="decimal" isOptional defaultValue={defaults.bathrooms} error={errors.bathrooms} helperText="Use .5 for a half bath, like 2.5." />
        </AdminFieldRow>
      </AdminFieldset>
      <AdminFieldset legend="Description">
        <AdminField name="description" label="About this property" isMultiline defaultValue={defaults.description} error={errors.description} helperText="Leave a blank line between paragraphs." />
      </AdminFieldset>
      <AdminFieldset legend="Web address">
        <AdminField
          name="slug"
          isCaseInsensitive
          label="Web address"
          isOptional={isNewListing}
          defaultValue={defaults.slug}
          error={errors.slug}
          helperText="charliewardrealty.com/listings/… Filled in from the address if left blank. Changing it later keeps the old address working."
        />
      </AdminFieldset>
    </>
  );
}

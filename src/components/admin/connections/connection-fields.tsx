import { AdminCheckbox } from "@/components/admin/admin-checkbox";
import { AdminField } from "@/components/admin/admin-field";
import { AdminFieldRow } from "@/components/admin/admin-field-row";
import { AdminFieldset } from "@/components/admin/admin-fieldset";
import { AdminSelect } from "@/components/admin/admin-select";
import type { FieldErrors } from "@/lib/admin/action-state";
import { CONNECTION_CATEGORIES } from "@/lib/content/connection-categories";

// A partner's details, shared by Add and Edit; short fields side by side
// (docs/admin-upload-layout-plan.md).

export type ConnectionDefaults = {
  fullName: string;
  category: string;
  titleLine: string;
  phone: string;
  email: string;
  website: string;
  isVisible: boolean;
};

const CATEGORY_OPTIONS = CONNECTION_CATEGORIES.map((category) => ({ value: category, label: category }));

export function ConnectionFields({ defaults, errors }: { defaults: ConnectionDefaults; errors: FieldErrors }) {
  return (
    <>
      <AdminFieldset legend="Partner">
        <AdminField name="fullName" label="Full name" defaultValue={defaults.fullName} error={errors.fullName} />
        <AdminSelect name="category" label="Category" options={CATEGORY_OPTIONS} defaultValue={defaults.category} helperText="The Connections page labels each partner with their category." />
        <AdminField name="titleLine" label="Title or license" isOptional defaultValue={defaults.titleLine} error={errors.titleLine} helperText="For example: Loan officer, NMLS 86956." />
      </AdminFieldset>
      <AdminFieldset legend="Contact" description="Shown on the Connections page. Leave blank to hide.">
        <AdminFieldRow>
          <AdminField name="phone" label="Phone" type="tel" isOptional defaultValue={defaults.phone} error={errors.phone} />
          <AdminField name="email" isCaseInsensitive label="Email" type="email" isOptional defaultValue={defaults.email} error={errors.email} />
        </AdminFieldRow>
        <AdminField name="website" label="Website" type="url" isOptional defaultValue={defaults.website} error={errors.website} helperText="The full address, starting with https://" />
      </AdminFieldset>
      <AdminFieldset legend="On the website">
        <AdminCheckbox name="isVisible" label="Show on the Connections page" defaultChecked={defaults.isVisible} helperText="Hiding keeps the partner here for later." />
      </AdminFieldset>
    </>
  );
}

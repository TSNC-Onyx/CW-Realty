"use client";

import { AdminField } from "@/components/admin/admin-field";
import { AdminFieldset } from "@/components/admin/admin-fieldset";
import { SaveBar } from "@/components/admin/save-bar";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { saveSiteSettingsAction } from "@/lib/admin/contact/actions";

export type ContactSettingsDefaults = {
  phone: string;
  textPhone: string;
  email: string;
  contactNames: string;
  officeAddressLine1: string;
  officeAddressLine2: string;
  officeCity: string;
  officeState: string;
  officePostalCode: string;
  licenseNumber: string;
  footerText: string;
};

export function ContactSettingsForm({ defaults }: { defaults: ContactSettingsDefaults }) {
  const { state, isPending, isDirty, formRef, handleSubmit, handleInput } = useAdminForm(saveSiteSettingsAction);
  const errors = state.fieldErrors;
  return (
    <form ref={formRef} onSubmit={handleSubmit} onInput={handleInput} noValidate className="grid gap-12">
      <AdminFieldset legend="Phone and email" description="Shown in the header, footer, Call/Text buttons, and Contact page.">
        <AdminField name="phone" label="Main phone" type="tel" autoComplete="tel-national" defaultValue={defaults.phone} error={errors.phone} />
        <AdminField name="textPhone" label="Number for text messages" type="tel" isOptional defaultValue={defaults.textPhone} error={errors.textPhone} helperText="Leave blank to use the main phone." />
        <AdminField name="email" label="Main email" type="email" defaultValue={defaults.email} error={errors.email} />
      </AdminFieldset>
      <AdminFieldset legend="People to ask for">
        <AdminField name="contactNames" label="Contact names" isOptional isMultiline defaultValue={defaults.contactNames} error={errors.contactNames} helperText="One name per line. Shown on the Contact page." />
      </AdminFieldset>
      <AdminFieldset legend="Office" description="Leave all office fields blank to hide the address.">
        <AdminField name="officeAddressLine1" label="Street address" isOptional autoComplete="address-line1" defaultValue={defaults.officeAddressLine1} error={errors.officeAddressLine1} />
        <AdminField name="officeAddressLine2" label="Suite or unit" isOptional autoComplete="address-line2" defaultValue={defaults.officeAddressLine2} error={errors.officeAddressLine2} />
        <AdminField name="officeCity" label="City" isOptional autoComplete="address-level2" defaultValue={defaults.officeCity} error={errors.officeCity} />
        <AdminField name="officeState" label="State" isOptional autoComplete="address-level1" maxLength={2} defaultValue={defaults.officeState} error={errors.officeState} />
        <AdminField name="officePostalCode" label="ZIP code" isOptional inputMode="numeric" autoComplete="postal-code" maxLength={5} defaultValue={defaults.officePostalCode} error={errors.officePostalCode} />
        <AdminField name="licenseNumber" label="NC firm license number" isOptional defaultValue={defaults.licenseNumber} error={errors.licenseNumber} />
      </AdminFieldset>
      <AdminFieldset legend="Footer">
        <AdminField name="footerText" label="Extra footer line" isOptional maxLength={300} defaultValue={defaults.footerText} error={errors.footerText} helperText="A short line shown at the bottom of every page." />
      </AdminFieldset>
      <SaveBar isPending={isPending} isDirty={isDirty} />
    </form>
  );
}

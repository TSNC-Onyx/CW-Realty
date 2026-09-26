"use client";

import { AdminField } from "@/components/admin/admin-field";
import { AdminFieldset } from "@/components/admin/admin-fieldset";
import { SaveBar } from "@/components/admin/save-bar";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { saveTrackingSettingsAction } from "@/lib/admin/tracking/actions";

export type TrackingSettingsDefaults = { gtmContainerId: string; metaPixelId: string };

export function TrackingSettingsForm({ defaults }: { defaults: TrackingSettingsDefaults }) {
  const { state, isPending, isDirty, formRef, handleSubmit, handleInput } = useAdminForm(saveTrackingSettingsAction);
  const errors = state.fieldErrors;
  return (
    <form ref={formRef} onSubmit={handleSubmit} onInput={handleInput} noValidate className="grid gap-12">
      <AdminFieldset legend="Google Tag Manager" description="Google Analytics, Google Ads, and the Meta Pixel are added inside this container. Leave blank to turn all tracking off.">
        <AdminField name="gtmContainerId" label="Container ID" isOptional maxLength={16} defaultValue={defaults.gtmContainerId} error={errors.gtmContainerId} helperText="Only use a container your business owns. Whatever it holds runs on every page of the website." />
      </AdminFieldset>
      <AdminFieldset legend="Meta (Facebook, Instagram)" description="Lets the website confirm leads to Meta directly, which counts leads that ad blockers would hide.">
        <AdminField name="metaPixelId" label="Pixel ID" isOptional inputMode="numeric" maxLength={20} defaultValue={defaults.metaPixelId} error={errors.metaPixelId} helperText="From Meta Events Manager → Data sources." />
      </AdminFieldset>
      <SaveBar isPending={isPending} isDirty={isDirty} />
    </form>
  );
}

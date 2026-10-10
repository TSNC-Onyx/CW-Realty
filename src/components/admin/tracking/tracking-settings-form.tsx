"use client";

import { Fragment } from "react";

import { AdminField } from "@/components/admin/admin-field";
import { AdminFieldset } from "@/components/admin/admin-fieldset";
import { SaveBar } from "@/components/admin/save-bar";
import { SavedStateProvider, type SavedStateText } from "@/components/admin/saved-state";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { saveTrackingSettingsAction } from "@/lib/admin/tracking/actions";

export type TrackingSettingsDefaults = { gtmContainerId: string; metaPixelId: string };

// Saved-state wording names the ID the website is using (owner request 2026-10-09,
// docs/cwr-ads-analytics-review-plan.md Part B).
type IdStatusWording = { savedPrefix: string; offWhenCleared: string };

const CONTAINER_WORDING: IdStatusWording = { savedPrefix: "Live on the website", offWhenCleared: "saving will turn tracking off" };
const PIXEL_WORDING: IdStatusWording = { savedPrefix: "Saved", offWhenCleared: "saving will turn off the Meta server connection" };

function getUnsavedText({ saved, current, wording }: { saved: string; current: string; wording: IdStatusWording }): string {
  if (!saved) return "Not saved yet";
  if (!current.trim()) return `Not saved yet — ${wording.offWhenCleared}`;
  return `Not saved yet — the website still uses ${saved}`;
}

function getIdStatusText({ saved, wording }: { saved: string; wording: IdStatusWording }): SavedStateText {
  return (state, current) => {
    if (state === "saved") return `${wording.savedPrefix}: ${saved}`;
    if (state === "empty") return "Off — nothing saved";
    return getUnsavedText({ saved, current, wording });
  };
}

export function TrackingSettingsForm({ defaults }: { defaults: TrackingSettingsDefaults }) {
  const { state, isPending, isDirty, savedVersion, formRef, handleSubmit, handleInput } = useAdminForm(saveTrackingSettingsAction, { problemAction: "tracking.save" });
  const errors = state.fieldErrors;
  return (
    <SavedStateProvider isNewItem={false}>
      <form ref={formRef} onSubmit={handleSubmit} onInput={handleInput} noValidate className="grid gap-12">
        {/* Restarts the fields from the stored values after each save; the Save bar keeps focus. */}
        <Fragment key={savedVersion}>
          <AdminFieldset legend="Google Tag Manager" description="Google Analytics, Google Ads, and the Meta Pixel are added inside this container. Leave blank to turn all tracking off.">
            <AdminField
              name="gtmContainerId"
              label="Container ID"
              isOptional
              isCaseInsensitive
              maxLength={16}
              defaultValue={defaults.gtmContainerId}
              error={errors.gtmContainerId}
              helperText="Only use a container your business owns. Whatever it holds runs on every page of the website."
              savedStateText={getIdStatusText({ saved: defaults.gtmContainerId, wording: CONTAINER_WORDING })}
            />
          </AdminFieldset>
          <AdminFieldset legend="Meta (Facebook, Instagram)" description="Lets the website confirm leads to Meta directly, which counts leads that ad blockers would hide.">
            <AdminField
              name="metaPixelId"
              label="Pixel ID"
              isOptional
              inputMode="numeric"
              maxLength={20}
              defaultValue={defaults.metaPixelId}
              error={errors.metaPixelId}
              helperText="From Meta Events Manager → Data sources."
              savedStateText={getIdStatusText({ saved: defaults.metaPixelId, wording: PIXEL_WORDING })}
            />
          </AdminFieldset>
        </Fragment>
        <SaveBar isPending={isPending} isDirty={isDirty} />
      </form>
    </SavedStateProvider>
  );
}

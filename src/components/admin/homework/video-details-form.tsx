"use client";

import { Fragment } from "react";

import { AdminCheckbox } from "@/components/admin/admin-checkbox";
import { AdminField } from "@/components/admin/admin-field";
import { AdminFieldset } from "@/components/admin/admin-fieldset";
import { SaveBar } from "@/components/admin/save-bar";
import { SavedStateProvider } from "@/components/admin/saved-state";
import { useAdminForm } from "@/components/admin/use-admin-form";
import type { FieldErrors } from "@/lib/admin/action-state";
import { updateHomeworkVideoAction } from "@/lib/admin/homework/actions";

// A video's details. Adding a video is NewVideoForm (details and files together).

export type VideoDefaults = { title: string; description: string; isSpanish: boolean; isVisible: boolean };

export function VideoFields({ defaults, errors }: { defaults: VideoDefaults; errors: FieldErrors }) {
  return (
    <AdminFieldset legend="Details">
      <AdminField name="title" label="Title" defaultValue={defaults.title} error={errors.title} maxLength={200} />
      <AdminField name="description" label="Description" isOptional isMultiline defaultValue={defaults.description} error={errors.description} maxLength={500} helperText="One or two sentences shown under the video." />
      <AdminCheckbox name="isSpanish" label="This video is in Spanish" defaultChecked={defaults.isSpanish} helperText="Screen readers then read its title and description in Spanish." />
    </AdminFieldset>
  );
}

export function VideoDetailsForm({ itemId, defaults }: { itemId: string; defaults: VideoDefaults }) {
  const { state, isPending, isDirty, savedVersion, formRef, handleSubmit, handleInput } = useAdminForm(updateHomeworkVideoAction, { problemAction: "homework.update_video" });
  return (
    <SavedStateProvider isNewItem={false}>
      <form ref={formRef} onSubmit={handleSubmit} onInput={handleInput} noValidate className="grid gap-12">
        {/* Restarts the fields from the stored values after each save; the Save bar keeps focus. */}
        <Fragment key={savedVersion}>
          <input type="hidden" name="itemId" value={itemId} />
          <VideoFields defaults={defaults} errors={state.fieldErrors} />
          <AdminFieldset legend="On the website">
            <AdminCheckbox name="isVisible" label="Show on the Homework page" defaultChecked={defaults.isVisible} helperText="Hiding keeps the video here for later." />
          </AdminFieldset>
        </Fragment>
        <SaveBar isPending={isPending} isDirty={isDirty} label="Save changes" />
      </form>
    </SavedStateProvider>
  );
}

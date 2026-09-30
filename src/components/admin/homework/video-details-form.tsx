"use client";

import { AdminCheckbox } from "@/components/admin/admin-checkbox";
import { AdminField } from "@/components/admin/admin-field";
import { AdminFieldset } from "@/components/admin/admin-fieldset";
import { SaveBar } from "@/components/admin/save-bar";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { useIdempotencyKey } from "@/components/admin/use-idempotency-key";
import { createHomeworkVideoAction, updateHomeworkVideoAction } from "@/lib/admin/homework/actions";

export type VideoDefaults = { title: string; description: string; isSpanish: boolean; isVisible: boolean };

type VideoDetailsFormProps =
  | { mode: "create"; idempotencyKey: string; defaults: VideoDefaults }
  | { mode: "edit"; itemId: string; defaults: VideoDefaults };

export function VideoDetailsForm(props: VideoDetailsFormProps) {
  const action = props.mode === "create" ? createHomeworkVideoAction : updateHomeworkVideoAction;
  const problemAction = props.mode === "create" ? "homework.create_video" : "homework.update_video";
  const { state, isPending, isDirty, formRef, handleSubmit, handleInput } = useAdminForm(action, { problemAction });
  const idempotencyKey = useIdempotencyKey(props.mode === "create" ? props.idempotencyKey : "", state);
  const { defaults } = props;
  const errors = state.fieldErrors;
  return (
    <form ref={formRef} onSubmit={handleSubmit} onInput={handleInput} noValidate className="grid gap-12">
      {props.mode === "create" ? <input type="hidden" name="idempotencyKey" value={idempotencyKey} /> : <input type="hidden" name="itemId" value={props.itemId} />}
      <AdminFieldset legend="Details">
        <AdminField name="title" label="Title" defaultValue={defaults.title} error={errors.title} maxLength={200} />
        <AdminField name="description" label="Description" isOptional isMultiline defaultValue={defaults.description} error={errors.description} maxLength={500} helperText="One or two sentences shown under the video." />
        <AdminCheckbox name="isSpanish" label="This video is in Spanish" defaultChecked={defaults.isSpanish} helperText="Screen readers then read its title and description in Spanish." />
      </AdminFieldset>
      {props.mode === "edit" && (
        <AdminFieldset legend="On the website">
          <AdminCheckbox name="isVisible" label="Show on the Homework page" defaultChecked={defaults.isVisible} helperText="Hiding keeps the video here for later." />
        </AdminFieldset>
      )}
      <SaveBar isPending={isPending} isDirty={isDirty} label={props.mode === "create" ? "Add video" : "Save changes"} />
    </form>
  );
}

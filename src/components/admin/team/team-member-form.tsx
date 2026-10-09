"use client";

import { Fragment } from "react";

import { AdminCheckbox } from "@/components/admin/admin-checkbox";
import { AdminField } from "@/components/admin/admin-field";
import { AdminFieldset } from "@/components/admin/admin-fieldset";
import { SaveBar } from "@/components/admin/save-bar";
import { SavedStateProvider } from "@/components/admin/saved-state";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { useIdempotencyKey } from "@/components/admin/use-idempotency-key";
import { createTeamMemberAction, updateTeamMemberAction } from "@/lib/admin/team/actions";

export type TeamMemberDefaults = {
  fullName: string;
  jobTitle: string;
  email: string;
  phone: string;
  bio: string;
  slug: string;
  isVisible: boolean;
};

type TeamMemberFormProps =
  | { mode: "create"; idempotencyKey: string; defaults: TeamMemberDefaults }
  | { mode: "edit"; memberId: string; defaults: TeamMemberDefaults };

export function TeamMemberForm(props: TeamMemberFormProps) {
  const action = props.mode === "create" ? createTeamMemberAction : updateTeamMemberAction;
  const { state, isPending, isDirty, savedVersion, formRef, handleSubmit, handleInput } = useAdminForm(action, { problemAction: props.mode === "create" ? "team.create" : "team.update" });
  const idempotencyKey = useIdempotencyKey(props.mode === "create" ? props.idempotencyKey : "", state);
  const { defaults } = props;
  const errors = state.fieldErrors;
  return (
    <SavedStateProvider isNewItem={props.mode === "create"}>
      <form ref={formRef} onSubmit={handleSubmit} onInput={handleInput} noValidate className="grid gap-12">
        {/* Restarts the fields from the stored values after each save; the Save bar keeps focus. */}
        <Fragment key={savedVersion}>
          {props.mode === "create" ? <input type="hidden" name="idempotencyKey" value={idempotencyKey} /> : <input type="hidden" name="memberId" value={props.memberId} />}
          <AdminFieldset legend="Profile">
            <AdminField name="fullName" label="Full name" defaultValue={defaults.fullName} error={errors.fullName} />
            <AdminField name="jobTitle" label="Title" isOptional defaultValue={defaults.jobTitle} error={errors.jobTitle} helperText="For example: Broker, or Design specialist." />
            <AdminField name="bio" label="Bio" isOptional isMultiline defaultValue={defaults.bio} error={errors.bio} helperText="Leave a blank line between paragraphs." />
          </AdminFieldset>
          <AdminFieldset legend="Contact" description="Shown on their profile page. Leave blank to hide.">
            <AdminField name="phone" label="Phone" type="tel" isOptional defaultValue={defaults.phone} error={errors.phone} />
            <AdminField name="email" isCaseInsensitive label="Email" type="email" isOptional defaultValue={defaults.email} error={errors.email} />
          </AdminFieldset>
          <AdminFieldset legend="On the website">
            <AdminCheckbox name="isVisible" label="Show on the team page" defaultChecked={defaults.isVisible} helperText="Hiding keeps the profile for later; its page sends visitors to the team page." />
            <AdminField
              name="slug"
              isCaseInsensitive
              label="Web address"
              isOptional={props.mode === "create"}
              defaultValue={defaults.slug}
              error={errors.slug}
              helperText="charliewardrealty.com/team/… Changing it later keeps the old address working."
            />
          </AdminFieldset>
        </Fragment>
        <SaveBar isPending={isPending} isDirty={isDirty} label={props.mode === "create" ? "Add team member" : "Save changes"} />
      </form>
    </SavedStateProvider>
  );
}

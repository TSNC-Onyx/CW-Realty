"use client";

import { Fragment, useId, useState } from "react";

import { AdminCheckbox } from "@/components/admin/admin-checkbox";
import { AdminField } from "@/components/admin/admin-field";
import { AdminFieldset } from "@/components/admin/admin-fieldset";
import { AdminSelect } from "@/components/admin/admin-select";
import { SaveBar } from "@/components/admin/save-bar";
import { SavedStateLine, SavedStateProvider } from "@/components/admin/saved-state";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { useIdempotencyKey } from "@/components/admin/use-idempotency-key";
import { createHomeworkDownloadAction, updateHomeworkDownloadAction } from "@/lib/admin/homework/actions";
import { getSavedState, type SavedState } from "@/lib/admin/saved-state";
import { HOMEWORK_GROUPS } from "@/lib/content/homework-rules";

export type Delivery = "file" | "link";

export type DownloadDefaults = {
  delivery: Delivery;
  groupKey: string;
  title: string;
  description: string;
  linkUrl: string;
  isSpanish: boolean;
  isVisible: boolean;
};

type DownloadDetailsFormProps =
  | { mode: "create"; idempotencyKey: string; defaults: DownloadDefaults }
  | { mode: "edit"; itemId: string; defaults: DownloadDefaults };

const GROUP_OPTIONS = HOMEWORK_GROUPS.map((group) => ({ value: group.key, label: group.label }));
const DELIVERY_OPTIONS: { value: Delivery; label: string }[] = [
  { value: "file", label: "A file to download" },
  { value: "link", label: "A link to another website" },
];

type DeliveryChoiceProps = { delivery: Delivery; savedState: SavedState; onChange: (delivery: Delivery) => void };

function DeliveryChoice({ delivery, savedState, onChange }: DeliveryChoiceProps) {
  const groupId = useId();
  const describedBy = savedState === "none" ? `${groupId}-helper` : `${groupId}-helper ${groupId}-saved`;
  return (
    <div role="radiogroup" aria-labelledby={`${groupId}-label`} aria-describedby={describedBy}>
      <p id={`${groupId}-label`} className="mb-1 text-base font-bold">What visitors get</p>
      {DELIVERY_OPTIONS.map((option) => (
        <label key={option.value} className="flex min-h-11 cursor-pointer items-center gap-3 text-base font-semibold">
          <input type="radio" name="delivery" value={option.value} checked={delivery === option.value} onChange={() => onChange(option.value)} className="size-6 accent-ink" />
          {option.label}
        </label>
      ))}
      <p id={`${groupId}-helper`} className="type-small text-muted">
        Use a link for documents another organization keeps up to date, like the NC Real Estate Commission&apos;s brochure.
      </p>
      <SavedStateLine id={`${groupId}-saved`} state={savedState} />
    </div>
  );
}

export function DownloadDetailsForm(props: DownloadDetailsFormProps) {
  const action = props.mode === "create" ? createHomeworkDownloadAction : updateHomeworkDownloadAction;
  const problemAction = props.mode === "create" ? "homework.create_download" : "homework.update_download";
  const { state, isPending, isDirty, savedVersion, formRef, handleSubmit, handleInput } = useAdminForm(action, { problemAction });
  const idempotencyKey = useIdempotencyKey(props.mode === "create" ? props.idempotencyKey : "", state);
  const { defaults } = props;
  const [delivery, setDelivery] = useState<Delivery>(defaults.delivery);
  const errors = state.fieldErrors;
  const isLink = delivery === "link";
  const deliverySavedState = getSavedState({ current: delivery, saved: defaults.delivery, isNewItem: props.mode === "create" });
  const visibilityHelp = isLink ? "Hiding keeps the link here for later." : "Hiding keeps the guide here for later. A guide shows once its file is uploaded.";
  return (
    <SavedStateProvider isNewItem={props.mode === "create"}>
      <form ref={formRef} onSubmit={handleSubmit} onInput={handleInput} noValidate className="grid gap-12">
        {/* Restarts the fields from the stored values after each save; the Save bar keeps focus. */}
        <Fragment key={savedVersion}>
          {props.mode === "create" ? <input type="hidden" name="idempotencyKey" value={idempotencyKey} /> : <input type="hidden" name="itemId" value={props.itemId} />}
          <AdminFieldset legend="What visitors get">
            <DeliveryChoice delivery={delivery} savedState={deliverySavedState} onChange={setDelivery} />
            {isLink ? (
              <AdminField name="linkUrl" label="Web address" type="url" defaultValue={defaults.linkUrl} error={errors.linkUrl} helperText="The full address, starting with https://" />
            ) : (
              <input type="hidden" name="linkUrl" value="" />
            )}
          </AdminFieldset>
          <AdminFieldset legend="Details">
            <AdminField name="title" label="Title" defaultValue={defaults.title} error={errors.title} maxLength={200} />
            <AdminField name="description" label="Description" isOptional isMultiline defaultValue={defaults.description} error={errors.description} maxLength={500} helperText="One or two sentences shown under the title." />
            <AdminSelect name="groupKey" label="Group" options={GROUP_OPTIONS} defaultValue={defaults.groupKey} helperText="Groups show in this order: For buyers, For sellers, En español, Required reading in North Carolina." />
            <AdminCheckbox name="isSpanish" label="This guide is in Spanish" defaultChecked={defaults.isSpanish} helperText="Its button then reads “Descargar” and screen readers read it in Spanish." />
          </AdminFieldset>
          <AdminFieldset legend="On the website">
            <AdminCheckbox name="isVisible" label="Show on the Homework page" defaultChecked={defaults.isVisible} helperText={visibilityHelp} />
          </AdminFieldset>
        </Fragment>
        <SaveBar isPending={isPending} isDirty={isDirty} label={props.mode === "create" ? "Add download or link" : "Save changes"} />
      </form>
    </SavedStateProvider>
  );
}

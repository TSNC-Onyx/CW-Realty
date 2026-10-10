"use client";

import { UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";

import { AdminTwoColumn } from "@/components/admin/admin-two-column";
import { ConnectionFields, type ConnectionDefaults } from "@/components/admin/connections/connection-fields";
import { ConnectionPreview, getConnectionPreviewValues, type ConnectionPreviewValues } from "@/components/admin/connections/connection-preview";
import { SaveBar } from "@/components/admin/save-bar";
import { SavedStateProvider } from "@/components/admin/saved-state";
import { useToast } from "@/components/admin/toast-provider";
import { FileDropZone } from "@/components/admin/uploads/file-drop-zone";
import { PendingPhotoList } from "@/components/admin/uploads/pending-photo-list";
import { fetchPhotoRecordProblem } from "@/components/admin/uploads/upload-photo-record";
import { handleGuardedSubmit, useCreateWithUploads, type UploadToRecord } from "@/components/admin/uploads/use-create-with-uploads";
import { usePendingPhotos, type PendingPhoto } from "@/components/admin/uploads/use-pending-photos";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { useIdempotencyKey } from "@/components/admin/use-idempotency-key";
import { PhotoPlaceholder } from "@/components/ui/photo-placeholder";
import { createConnectionAction, setConnectionPhotoAction } from "@/lib/admin/connections/actions";

// Add connection (owner choice 2026-10-10, docs/admin-upload-layout-plan.md): details on the
// left; the photo and a live preview on the right. "Add connection" saves the partner,
// uploads the photo, then opens the partner.

const CONNECTIONS_ADMIN_PATH = "/admin/connections";
const PREVIEW_WIDTH = 112;
const PREVIEW_HEIGHT = 140;

function PreviewPortrait({ photo }: { photo: PendingPhoto | null }) {
  if (!photo) return <PhotoPlaceholder ratio="portrait" />;
  // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file
  return <img src={photo.previewUrl} alt="" width={PREVIEW_WIDTH} height={PREVIEW_HEIGHT} className="aspect-portrait w-full object-cover" />;
}

export function NewConnectionForm({ idempotencyKey: initialKey, defaults }: { idempotencyKey: string; defaults: ConnectionDefaults }) {
  const pending = usePendingPhotos();
  const [previewValues, setPreviewValues] = useState<ConnectionPreviewValues>(defaults);
  const { showToast } = useToast();
  const chosenPhoto = pending.photos[0] ?? null;

  const uploadToRecord: UploadToRecord = async ({ recordId, showStatus }) => {
    if (!chosenPhoto) return 0;
    showStatus("Uploading the photo…");
    const problem = await fetchPhotoRecordProblem({
      target: { kind: "connection", recordId },
      file: chosenPhoto.file,
      saveProblemAction: "connections.set_photo",
      save: (uploaded) => setConnectionPhotoAction({ connectionId: recordId, ...uploaded, alt: chosenPhoto.alt }),
    });
    if (problem === null) return 0;
    showToast({ tone: "error", title: "The photo didn't upload", body: problem });
    return 1;
  };
  const { isUploading, uploadStatus, handleCreated } = useCreateWithUploads({ editPath: CONNECTIONS_ADMIN_PATH, uploadToRecord });
  const { state, isPending, isDirty, formRef, handleSubmit, handleInput } = useAdminForm(createConnectionAction, { problemAction: "connections.create", onSuccess: (saved) => void handleCreated(saved) });
  const idempotencyKey = useIdempotencyKey(initialKey, state);
  const isBusy = isPending || isUploading;

  const handleFormInput = () => {
    handleInput();
    if (formRef.current) setPreviewValues(getConnectionPreviewValues(formRef.current));
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) =>
    handleGuardedSubmit(event, { isBusy, showBlocker: pending.firstMissing ? pending.showMissingDescriptions : null, submit: handleSubmit });

  const side = (
    <>
      <div className="grid gap-4 border-t-2 border-ink pt-6">
        <h2 className="type-h3">
          Photo<span className="ml-2 text-base font-regular text-muted">(optional)</span>
        </h2>
        <FileDropZone
          icon={UserRound}
          title="Drag a portrait here"
          chooseLabel={chosenPhoto ? "Choose a different photo" : "Choose a photo"}
          helperText="A portrait works best, at least 800 × 1000 pixels. It is cropped to fit."
          accept="image/*"
          isDisabled={isBusy}
          onFiles={([file]) => file && pending.replaceWithFile(file)}
        />
        <PendingPhotoList pending={pending} isDisabled={isBusy} />
      </div>
      <ConnectionPreview values={previewValues} photo={<PreviewPortrait photo={chosenPhoto} />} />
    </>
  );

  return (
    <SavedStateProvider isNewItem>
      <form ref={formRef} onSubmit={handleFormSubmit} onInput={handleFormInput} noValidate>
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <AdminTwoColumn sideLabel="Photo and preview" main={<ConnectionFields defaults={defaults} errors={state.fieldErrors} />} side={side} />
        <SaveBar isPending={isBusy} isDirty={isDirty} label="Add connection">
          <p role="status" className="type-small font-semibold">
            {uploadStatus}
          </p>
        </SaveBar>
      </form>
    </SavedStateProvider>
  );
}

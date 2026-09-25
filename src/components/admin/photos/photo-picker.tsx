"use client";

import { ImagePlus, LoaderCircle } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";

import { AdminField } from "@/components/admin/admin-field";
import { usePhotoUpload, type UploadedPhoto } from "@/components/admin/photos/use-photo-upload";
import { useToast } from "@/components/admin/toast-provider";
import { getButtonClassName } from "@/components/ui/button-link";
import { Message } from "@/components/ui/message";
import type { PhotoTarget } from "@/lib/admin/photos/actions";
import { MAX_ALT_TEXT_LENGTH } from "@/lib/admin/photos/photo-files";
import type { QuickResult } from "@/lib/admin/quick-result";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Choose a photo, describe it (alt text is required, Admin §2), then upload. The photo is
// resized and converted in this browser before it is sent.

const PERCENT = 100;
const PREVIEW_WIDTH = 240;
const PREVIEW_HEIGHT = 160;

type PhotoPickerProps = {
  target: PhotoTarget;
  buttonLabel: string;
  onUploaded: (photo: UploadedPhoto, alt: string) => Promise<QuickResult>;
};

function getStageText(stage: "idle" | "preparing" | "uploading", share: number): string {
  if (stage === "preparing") return `Preparing photo… ${Math.round(share * PERCENT)}%`;
  if (stage === "uploading") return "Uploading…";
  return "";
}

export function PhotoPicker({ target, buttonLabel, onUploaded }: PhotoPickerProps) {
  const inputId = useId();
  const { showToast } = useToast();
  const { progress, uploadPhoto, clearError } = usePhotoUpload(target);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [altError, setAltError] = useState<string | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const detailsRef = useRef<HTMLDivElement>(null);
  const isBusy = progress.stage !== "idle";

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0] ?? null;
    clearError();
    setFile(chosen);
    setPreviewUrl(chosen ? URL.createObjectURL(chosen) : null);
  };

  const handleUpload = async () => {
    const alt = (detailsRef.current?.querySelector<HTMLTextAreaElement | HTMLInputElement>("[name=photoAlt]")?.value ?? "").trim();
    if (!file) return;
    if (!alt) return setAltError("Describe the photo, for example “Front of the brick home with a covered porch”");
    setAltError(null);
    const uploaded = await uploadPhoto(file);
    if (!uploaded) return;
    const result = await onUploaded(uploaded, alt);
    showToast({ tone: result.status === "success" ? "success" : "error", title: result.message });
    if (result.status === "success") {
      setFile(null);
      setPreviewUrl(null);
      setPickerKey((key) => key + 1);
    }
  };

  return (
    <div key={pickerKey} className="grid max-w-form gap-4 border border-dashed border-field-border p-4">
      <div>
        <label htmlFor={inputId} className="mb-1 block text-base font-bold">
          Choose a photo
        </label>
        <input id={inputId} type="file" accept="image/*" onChange={handleFileChange} disabled={isBusy} className="field-input" />
      </div>
      {previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file
        <img src={previewUrl} alt="" width={PREVIEW_WIDTH} height={PREVIEW_HEIGHT} className="aspect-photo w-60 object-cover" />
      )}
      {file && (
        <div ref={detailsRef} className="grid gap-4">
          <AdminField name="photoAlt" label="Describe the photo" isMultiline maxLength={MAX_ALT_TEXT_LENGTH} error={altError} helperText="Screen readers read this aloud. Say what the photo shows." />
          <button
            type="button"
            aria-busy={isBusy}
            onClick={() => void handleUpload()}
            className={getButtonClassName({ size: "m", variant: "main" })}
          >
            {isBusy ? <LoaderCircle aria-hidden size={ICON_SIZE.button} className="animate-spin" /> : <ImagePlus aria-hidden size={ICON_SIZE.button} />}
            {isBusy ? getStageText(progress.stage, progress.share) : buttonLabel}
          </button>
        </div>
      )}
      <p role="status" className="sr-only">
        {getStageText(progress.stage, progress.share)}
      </p>
      {progress.error && <Message tone="error" title={progress.error} onDismiss={clearError} />}
    </div>
  );
}

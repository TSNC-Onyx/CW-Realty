"use client";

import { LoaderCircle, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type ChangeEvent } from "react";

import { useHomeworkUpload, type HomeworkUploadProgress } from "@/components/admin/homework/use-homework-upload";
import { useToast } from "@/components/admin/toast-provider";
import { getButtonClassName } from "@/components/ui/button-link";
import { Message } from "@/components/ui/message";
import { UPLOAD_FORMATS, type UploadPurpose } from "@/lib/content/homework-rules";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Choose a file, then upload it (Admin → Homework, owner-approved design 2026-09-27).
// Mirrors the photo picker: a labelled file field, one button that reports progress, and
// a message beside the field when something goes wrong.

const PERCENT = 100;

type HomeworkFileUploadProps = {
  itemId: string;
  purpose: UploadPurpose;
  chooseLabel: string;
  buttonLabel: string;
  helperText: string;
  /** Make a cover from the video's opening scene once it is saved (videos without an uploaded cover). */
  isMakingCover?: boolean;
};

function getStageText(progress: HomeworkUploadProgress): string {
  if (progress.stage === "checking") return "Checking the file…";
  if (progress.stage === "uploading") return `Uploading… ${Math.round(progress.share * PERCENT)}%`;
  if (progress.stage === "saving") return "Saving…";
  if (progress.stage === "cover") return "Making a cover picture…";
  return "";
}

function getAcceptList(purpose: UploadPurpose): string {
  return UPLOAD_FORMATS[purpose].flatMap((format) => [format.mime, ...format.extensions.map((extension) => `.${extension}`)]).join(",");
}

export function HomeworkFileUpload({ itemId, purpose, chooseLabel, buttonLabel, helperText, isMakingCover = false }: HomeworkFileUploadProps) {
  const inputId = useId();
  const router = useRouter();
  const { showToast } = useToast();
  const { progress, uploadFile, clearError } = useHomeworkUpload({ itemId, purpose, isMakingCover });
  const [file, setFile] = useState<File | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const isBusy = progress.stage !== "idle";

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    clearError();
    setFile(event.target.files?.[0] ?? null);
  };

  const handleUpload = async () => {
    if (!file) return;
    const result = await uploadFile(file);
    if (result.status === "error") return;
    showToast({ tone: "success", title: result.message });
    if (result.coverNotice) showToast(result.coverNotice);
    setFile(null);
    setPickerKey((key) => key + 1);
    router.refresh();
  };

  return (
    <div key={pickerKey} className="grid max-w-form gap-4 border border-dashed border-field-border p-4">
      <div>
        <label htmlFor={inputId} className="mb-1 block text-base font-bold">
          {chooseLabel}
        </label>
        <input
          id={inputId}
          type="file"
          accept={getAcceptList(purpose)}
          onChange={handleFileChange}
          disabled={isBusy}
          aria-describedby={`${inputId}-helper`}
          className="field-input"
        />
        <p id={`${inputId}-helper`} className="type-small mt-1 text-muted">
          {helperText}
        </p>
      </div>
      {file && (
        <button type="button" aria-busy={isBusy} onClick={() => void handleUpload()} className={getButtonClassName({ size: "m", variant: "main" })}>
          {isBusy ? <LoaderCircle aria-hidden size={ICON_SIZE.button} className="animate-spin" /> : <Upload aria-hidden size={ICON_SIZE.button} />}
          {isBusy ? getStageText(progress) : buttonLabel}
        </button>
      )}
      <p role="status" className="sr-only">
        {getStageText(progress)}
      </p>
      {progress.error && <Message tone="error" title={progress.error} onDismiss={clearError} />}
    </div>
  );
}

"use client";

import { CircleAlert, type LucideIcon } from "lucide-react";
import { useId, useState, type ChangeEvent, type DragEvent, type Ref } from "react";

import { getDescribedBy } from "@/components/admin/saved-state";
import { getButtonClassName } from "@/components/ui/button-link";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// A file field you can also drop files on (docs/admin-upload-layout-plan.md). The real file
// input stays in the page for keyboards and screen readers; the dashed box is its label.

type FileDropZoneProps = {
  icon: LucideIcon;
  title: string;
  /** The button text inside the box; with title it names the file field. */
  chooseLabel: string;
  helperText: string;
  accept: string;
  isMultiple?: boolean;
  isDisabled?: boolean;
  error?: string | null;
  /** Lets the page move focus to the file field when something must be chosen. */
  inputRef?: Ref<HTMLInputElement>;
  onFiles: (files: File[]) => void;
};

function hasDraggedFiles(event: DragEvent<HTMLElement>): boolean {
  return event.dataTransfer.types.includes("Files");
}

export function FileDropZone({ icon: Icon, title, chooseLabel, helperText, accept, isMultiple = false, isDisabled = false, error = null, inputRef, onFiles }: FileDropZoneProps) {
  const inputId = useId();
  const [isDragOver, setIsDragOver] = useState(false);
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (files.length > 0) onFiles(files);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (isDisabled || !hasDraggedFiles(event)) return;
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (isDisabled || !hasDraggedFiles(event)) return;
    event.preventDefault();
    setIsDragOver(false);
    const files = [...event.dataTransfer.files];
    onFiles(isMultiple ? files : files.slice(0, 1));
  };

  const boxStateClass = isDragOver ? "border-gold-deep bg-gold/15" : "border-field-border bg-surface";
  return (
    <div onDragOver={handleDragOver} onDragLeave={() => setIsDragOver(false)} onDrop={handleDrop}>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={isMultiple}
        disabled={isDisabled}
        onChange={handleChange}
        aria-invalid={error ? true : undefined}
        aria-describedby={getDescribedBy([helperId, error && errorId])}
        className="peer sr-only"
      />
      <label
        htmlFor={inputId}
        className={`grid cursor-pointer justify-items-center gap-2 border-2 border-dashed p-6 text-center peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-(--focus-ring-color) peer-disabled:cursor-not-allowed peer-disabled:opacity-60 ${boxStateClass}`}
      >
        <Icon aria-hidden size={ICON_SIZE.badge} className="text-muted" />
        <span className="text-base font-bold">{title}</span>
        <span className={getButtonClassName({ size: "s", variant: "secondary" })}>{chooseLabel}</span>
      </label>
      <p id={helperId} className="type-small mt-2 text-muted">
        {helperText}
      </p>
      {error && (
        <p id={errorId} className="mt-1 flex items-start gap-2 text-sm leading-normal font-semibold text-error">
          <CircleAlert aria-hidden size={ICON_SIZE.inline} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

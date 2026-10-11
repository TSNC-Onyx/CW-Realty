"use client";

import { FileVideoCamera, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { getButtonClassName } from "@/components/ui/button-link";
import { getFileSizeLabel } from "@/lib/content/homework-rules";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// The video picked on Add video, before it uploads: it plays here so you can check it's the
// right one (docs/admin-upload-layout-plan.md). Admin pages allow blob: media for this.

/** Plays the file in the video element; the local link is released when the file changes. */
function usePlayableFile(file: File) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    if (videoRef.current) videoRef.current.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return videoRef;
}

export function ChosenVideo({ file, isDisabled, onRemove }: { file: File; isDisabled: boolean; onRemove: () => void }) {
  const videoRef = usePlayableFile(file);
  return (
    <div className="grid gap-3">
      <video ref={videoRef} controls muted preload="metadata" className="aspect-video w-full bg-ink" aria-label={`Preview of ${file.name}`} />
      <div className="flex items-center gap-3 border border-line bg-surface p-3">
        <FileVideoCamera aria-hidden size={ICON_SIZE.badge} className="shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="font-bold break-words">{file.name}</p>
          <p className="type-small text-muted">{getFileSizeLabel(file.size)}</p>
        </div>
        <button type="button" disabled={isDisabled} onClick={onRemove} aria-label={`Remove ${file.name}`} className={`${getButtonClassName({ size: "s", variant: "secondary" })} px-2`}>
          <X aria-hidden size={ICON_SIZE.button} />
        </button>
      </div>
    </div>
  );
}

"use client";

import { Captions, FileText, FileVideoCamera, ImageOff, Trash2, type LucideIcon } from "lucide-react";

import { HomeworkFileUpload } from "@/components/admin/homework/homework-file-upload";
import { PhotoPicker } from "@/components/admin/photos/photo-picker";
import { QuickActionButton } from "@/components/admin/quick-action-button";
import { ResponsivePhoto } from "@/components/content/responsive-photo";
import { Message } from "@/components/ui/message";
import { removeHomeworkCoverAction, setHomeworkCoverAction } from "@/lib/admin/homework/actions";
import { removeHomeworkCaptionsAction } from "@/lib/admin/homework/upload-actions";
import type { HomeworkCover } from "@/lib/content/homework";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Edit-page sections for a Homework item's files (owner-approved design 2026-09-27).

export type StoredFile = { name: string; detail: string };

function CurrentFile({ icon: Icon, file }: { icon: LucideIcon; file: StoredFile }) {
  return (
    <div className="flex max-w-form items-center gap-4 border border-field-border bg-surface p-4">
      <span aria-hidden className="flex size-14 shrink-0 items-center justify-center border border-field-border">
        <Icon size={ICON_SIZE.badge} />
      </span>
      <div className="min-w-0">
        <p className="font-bold break-words">{file.name}</p>
        <p className="type-small text-muted">{file.detail}</p>
      </div>
    </div>
  );
}

function PanelHeading({ id, title, isOptional = false }: { id: string; title: string; isOptional?: boolean }) {
  return (
    <h2 id={id} className="type-h3 mb-4">
      {title}
      {isOptional && <span className="ml-2 text-base font-regular text-muted">(optional)</span>}
    </h2>
  );
}

export function VideoFilePanel({ itemId, file }: { itemId: string; file: StoredFile | null }) {
  return (
    <section aria-labelledby="video-file-heading" className="grid gap-4 border-t-2 border-ink pt-6">
      <PanelHeading id="video-file-heading" title="Video file" />
      {file ? <CurrentFile icon={FileVideoCamera} file={file} /> : <Message tone="info" title="No video yet">Upload the video. It shows on the Homework page as soon as it&apos;s uploaded.</Message>}
      <HomeworkFileUpload
        itemId={itemId}
        purpose="video"
        chooseLabel={file ? "Choose a new video" : "Choose a video"}
        buttonLabel={file ? "Replace video" : "Upload video"}
        helperText="MP4 video, up to 50 MB. Under 25 MB loads faster on phones. The length and size are filled in for you."
      />
    </section>
  );
}

export function DocumentFilePanel({ itemId, file }: { itemId: string; file: StoredFile | null }) {
  return (
    <section aria-labelledby="document-file-heading" className="grid gap-4 border-t-2 border-ink pt-6">
      <PanelHeading id="document-file-heading" title="File" />
      {file ? <CurrentFile icon={FileText} file={file} /> : <Message tone="info" title="No file yet">Upload the guide. It shows on the Homework page as soon as it&apos;s uploaded.</Message>}
      <HomeworkFileUpload
        itemId={itemId}
        purpose="document"
        chooseLabel={file ? "Choose a new file" : "Choose a file"}
        buttonLabel={file ? "Replace file" : "Upload file"}
        helperText="PDF, PowerPoint, Word, or Excel, up to 20 MB. The type and size shown to visitors are filled in for you."
      />
    </section>
  );
}

export function CoverPanel({ itemId, title, cover }: { itemId: string; title: string; cover: HomeworkCover | null }) {
  return (
    <section aria-labelledby="cover-heading" className="grid gap-4 border-t-2 border-ink pt-6">
      <PanelHeading id="cover-heading" title="Cover picture" isOptional />
      <p className="type-small max-w-prose text-muted">Shown before the video plays. Without one, visitors see the video&apos;s first frame. A wide picture (16:9) works best.</p>
      {cover && (
        <div className="grid max-w-form gap-4">
          <div className="w-72">
            <ResponsivePhoto photo={cover} ratio="photo" sizes="288px" />
          </div>
          <div>
            <QuickActionButton
              label="Remove cover picture"
              accessibleLabel={`Remove the cover picture of ${title}`}
              icon={ImageOff}
              problemAction="homework.remove_cover"
              onRun={() => removeHomeworkCoverAction(itemId)}
              undo={{ label: "Undo", problemAction: "homework.set_cover", onRun: () => setHomeworkCoverAction({ itemId, ...cover }) }}
            />
          </div>
        </div>
      )}
      <PhotoPicker target={{ kind: "homework", recordId: itemId }} buttonLabel={cover ? "Replace cover picture" : "Add cover picture"} saveProblemAction="homework.set_cover" onUploaded={(uploaded, alt) => setHomeworkCoverAction({ itemId, ...uploaded, alt })} />
    </section>
  );
}

export function CaptionsPanel({ itemId, title, hasCaptions }: { itemId: string; title: string; hasCaptions: boolean }) {
  return (
    <section aria-labelledby="captions-heading" className="grid gap-4 border-t-2 border-ink pt-6">
      <PanelHeading id="captions-heading" title="Captions" />
      {hasCaptions ? (
        <div className="flex max-w-form flex-wrap items-center gap-4">
          <CurrentFile icon={Captions} file={{ name: "Captions added", detail: "Visitors can turn them on in the video player." }} />
          <QuickActionButton label="Remove captions" accessibleLabel={`Remove the captions of ${title}`} icon={Trash2} problemAction="homework.remove_captions" onRun={() => removeHomeworkCaptionsAction(itemId)} />
        </div>
      ) : (
        <div className="max-w-form">
          <Message tone="warning" title="No captions yet">
            Captions are required before the site launches, so viewers who are deaf or watching with the sound off can follow along.
          </Message>
        </div>
      )}
      <HomeworkFileUpload
        itemId={itemId}
        purpose="captions"
        chooseLabel={hasCaptions ? "Choose a new captions file" : "Choose a captions file"}
        buttonLabel={hasCaptions ? "Replace captions" : "Add captions"}
        helperText="A WebVTT captions file (.vtt). YouTube, captioning services, and most video tools can export one."
      />
    </section>
  );
}

"use client";

import { Captions, FileVideoCamera, ImagePlus, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

import { AdminTwoColumn } from "@/components/admin/admin-two-column";
import { ChosenVideo } from "@/components/admin/homework/chosen-video";
import { getAcceptList } from "@/components/admin/homework/homework-file-upload";
import { fetchMissedVideoFileCount } from "@/components/admin/homework/upload-new-video";
import { VideoFields, type VideoDefaults } from "@/components/admin/homework/video-details-form";
import { SaveBar } from "@/components/admin/save-bar";
import { SavedStateProvider } from "@/components/admin/saved-state";
import { useToast } from "@/components/admin/toast-provider";
import { FileDropZone } from "@/components/admin/uploads/file-drop-zone";
import { PendingPhotoList } from "@/components/admin/uploads/pending-photo-list";
import { handleGuardedSubmit, useCreateWithUploads, type UploadToRecord } from "@/components/admin/uploads/use-create-with-uploads";
import { usePendingPhotos } from "@/components/admin/uploads/use-pending-photos";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { useIdempotencyKey } from "@/components/admin/use-idempotency-key";
import { getButtonClassName } from "@/components/ui/button-link";
import { Message } from "@/components/ui/message";
import { createHomeworkVideoAction } from "@/lib/admin/homework/actions";
import { getUploadProblem, type UploadPurpose } from "@/lib/content/homework-rules";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Add video (owner choice 2026-10-10, docs/admin-upload-layout-plan.md): details on the
// left; the video, an optional cover picture, and captions on the right. "Add video" saves the
// details, uploads the files, then opens the video.

const HOMEWORK_ADMIN_PATH = "/admin/homework";
const MISSING_VIDEO_MESSAGE = "Choose the video to upload";

type ChosenFile = { file: File | null; error: string | null };

const NO_FILE: ChosenFile = { file: null, error: null };

function getChosenFile({ purpose, file }: { purpose: UploadPurpose; file: File | undefined }): ChosenFile {
  if (!file) return NO_FILE;
  const problem = getUploadProblem({ purpose, fileName: file.name, sizeBytes: file.size });
  return problem ? { file: null, error: problem } : { file, error: null };
}

function PanelHeading({ title, isOptional = false }: { title: string; isOptional?: boolean }) {
  return (
    <h2 className="type-h3">
      {title}
      {isOptional && <span className="ml-2 text-base font-regular text-muted">(optional)</span>}
    </h2>
  );
}

function ChosenCaptions({ file, isDisabled, onRemove }: { file: File; isDisabled: boolean; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 border border-line bg-surface p-3">
      <Captions aria-hidden size={ICON_SIZE.badge} className="shrink-0 text-muted" />
      <p className="min-w-0 flex-1 font-bold break-words">{file.name}</p>
      <button type="button" disabled={isDisabled} onClick={onRemove} aria-label={`Remove ${file.name}`} className={`${getButtonClassName({ size: "s", variant: "secondary" })} px-2`}>
        <X aria-hidden size={ICON_SIZE.button} />
      </button>
    </div>
  );
}

export function NewVideoForm({ idempotencyKey: initialKey, defaults }: { idempotencyKey: string; defaults: VideoDefaults }) {
  const [video, setVideo] = useState<ChosenFile>(NO_FILE);
  const [captions, setCaptions] = useState<ChosenFile>(NO_FILE);
  const cover = usePendingPhotos();
  const videoInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const uploadToRecord: UploadToRecord = async ({ recordId, showStatus }) => {
    if (!video.file) return 0;
    return fetchMissedVideoFileCount({
      itemId: recordId,
      files: { video: video.file, cover: cover.photos[0] ?? null, captions: captions.file },
      showStatus,
      showProblem: ({ title, message }) => showToast({ tone: "error", title, body: message }),
      showCoverNotice: showToast,
    });
  };
  const { isUploading, uploadStatus, handleCreated } = useCreateWithUploads({ editPath: HOMEWORK_ADMIN_PATH, uploadToRecord });
  const { state, isPending, isDirty, formRef, handleSubmit, handleInput } = useAdminForm(createHomeworkVideoAction, { problemAction: "homework.create_video", onSuccess: (saved) => void handleCreated(saved) });
  const idempotencyKey = useIdempotencyKey(initialKey, state);
  const isBusy = isPending || isUploading;

  const showMissingVideo = () => {
    setVideo({ file: null, error: MISSING_VIDEO_MESSAGE });
    videoInputRef.current?.focus();
    showToast({ tone: "error", title: MISSING_VIDEO_MESSAGE });
  };

  const getBlocker = (): (() => void) | null => {
    if (!video.file) return showMissingVideo;
    return cover.firstMissing ? cover.showMissingDescriptions : null;
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => handleGuardedSubmit(event, { isBusy, showBlocker: getBlocker(), submit: handleSubmit });

  const side = (
    <>
      <section aria-label="Video file" className="grid gap-4 border-t-2 border-ink pt-6">
        <PanelHeading title="Video file" />
        {video.file && <ChosenVideo file={video.file} isDisabled={isBusy} onRemove={() => setVideo(NO_FILE)} />}
        <FileDropZone
          icon={FileVideoCamera}
          title="Drag the video here"
          chooseLabel={video.file ? "Choose a different video" : "Choose a video"}
          helperText="MP4 video, up to 50 MB. Under 25 MB loads faster on phones. The length and size are filled in for you."
          accept={getAcceptList("video")}
          isDisabled={isBusy}
          error={video.error}
          inputRef={videoInputRef}
          onFiles={([file]) => {
            handleInput();
            setVideo(getChosenFile({ purpose: "video", file }));
          }}
        />
      </section>
      <section aria-label="Cover picture" className="grid gap-4 border-t-2 border-ink pt-6">
        <PanelHeading title="Cover picture" isOptional />
        <p className="type-small text-muted">Shown before the video plays. If you don&apos;t add one, a picture is made from the video&apos;s opening scene. A wide picture (16:9) works best.</p>
        <FileDropZone
          icon={ImagePlus}
          title="Drag a picture here"
          chooseLabel={cover.photos.length > 0 ? "Choose a different cover picture" : "Choose a cover picture"}
          helperText="It's resized for you."
          accept="image/*"
          isDisabled={isBusy}
          onFiles={([file]) => file && cover.replaceWithFile(file)}
        />
        <PendingPhotoList pending={cover} isDisabled={isBusy} />
      </section>
      <section aria-label="Captions" className="grid gap-4 border-t-2 border-ink pt-6">
        <PanelHeading title="Captions" isOptional />
        {!captions.file && (
          <Message tone="warning" title="Captions are needed before the site launches">
            They let viewers who are deaf or watching with the sound off follow along. You can add them later too.
          </Message>
        )}
        {captions.file && <ChosenCaptions file={captions.file} isDisabled={isBusy} onRemove={() => setCaptions(NO_FILE)} />}
        <FileDropZone
          icon={Captions}
          title="Drag a captions file here"
          chooseLabel={captions.file ? "Choose a different captions file" : "Choose a captions file"}
          helperText="A WebVTT captions file (.vtt). YouTube, captioning services, and most video tools can export one."
          accept={getAcceptList("captions")}
          isDisabled={isBusy}
          error={captions.error}
          onFiles={([file]) => {
            handleInput();
            setCaptions(getChosenFile({ purpose: "captions", file }));
          }}
        />
      </section>
    </>
  );

  return (
    <SavedStateProvider isNewItem>
      <form ref={formRef} onSubmit={handleFormSubmit} onInput={handleInput} noValidate>
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <AdminTwoColumn sideLabel="Video files" main={<VideoFields defaults={defaults} errors={state.fieldErrors} />} side={side} />
        <SaveBar isPending={isBusy} isDirty={isDirty} label="Add video">
          <p role="status" className="type-small font-semibold">
            {uploadStatus}
          </p>
        </SaveBar>
      </form>
    </SavedStateProvider>
  );
}

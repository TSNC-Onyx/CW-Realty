import { unstable_rethrow } from "next/navigation";

import { getMessageWithReference } from "@/components/admin/homework/upload-problems";
import { getPhotoStepMessage, getPhotoStepProblem, prepareFramePhoto, sendEncodedPhoto } from "@/components/admin/photos/use-photo-upload";
import type { MessageTone } from "@/components/ui/message";
import { setHomeworkVideoCoverAction } from "@/lib/admin/homework/actions";
import { fetchCoverFrame, type CoverFrameMissReason } from "@/lib/admin/homework/video-frame";
import { callQuickAction } from "@/lib/observability/call-server-action";
import type { BrowserProblemCode } from "@/lib/observability/client-problem";
import type { ProblemAction } from "@/lib/observability/problem-catalog";
import { reportClientProblem } from "@/lib/observability/report-client-problem";

// After a video is saved, makes its cover from the opening scene (docs/cwr-video-auto-cover-plan.md).
// The video is already safe at this point, so every outcome is a notice, never an upload error,
// and every notice that isn't a success is recorded (owner rule 2026-09-27).

export type CoverNotice = { tone: Extract<MessageTone, "success" | "info" | "warning">; title: string; body?: string };

const MAKE_COVER_ACTION: ProblemAction = "homework.make_cover";
const COVER_NOT_SAVED_TITLE = "The video is saved, but its cover picture didn't save. Add one below.";
const MISSED_FRAME_TITLES: Record<CoverFrameMissReason, string> = {
  black: "No cover picture was made because the video starts on a black screen. Add one below.",
  unreadable: "This browser couldn't read the video to make a cover picture. Add one below.",
  timeout: "Making a cover picture took too long. Add one below.",
};
const MISSED_FRAME_CODES: Record<CoverFrameMissReason, BrowserProblemCode> = { black: "other", unreadable: "decode_error", timeout: "timeout" };

async function fetchMissedFrameNotice({ reason, detail }: { reason: CoverFrameMissReason; detail: string }): Promise<CoverNotice> {
  const title = MISSED_FRAME_TITLES[reason];
  await reportClientProblem({ action: MAKE_COVER_ACTION, stage: "browser", severity: "info", code: MISSED_FRAME_CODES[reason], shownMessage: title, detail });
  return { tone: "info", title };
}

// Encoding and upload failures are recorded under this feature's own action, with plain wording.
async function fetchFailedCoverNotice(error: unknown): Promise<CoverNotice> {
  const problem = getPhotoStepProblem(error);
  if (!problem) return { tone: "warning", title: COVER_NOT_SAVED_TITLE, body: getPhotoStepMessage(error) };
  const reference = await reportClientProblem({ ...problem, action: MAKE_COVER_ACTION, shownMessage: COVER_NOT_SAVED_TITLE });
  return { tone: "warning", title: getMessageWithReference({ message: COVER_NOT_SAVED_TITLE, severity: problem.severity, reference }) };
}

async function fetchSavedCoverNotice({ itemId, bitmap }: { itemId: string; bitmap: ImageBitmap }): Promise<CoverNotice> {
  try {
    const encoded = await prepareFramePhoto(bitmap);
    const uploaded = await sendEncodedPhoto({ kind: "homework", recordId: itemId }, encoded);
    const result = await callQuickAction(MAKE_COVER_ACTION, () => setHomeworkVideoCoverAction({ itemId, ...uploaded }));
    return result.status === "success" ? { tone: "success", title: result.message } : { tone: "warning", title: COVER_NOT_SAVED_TITLE, body: result.message };
  } catch (error) {
    unstable_rethrow(error);
    bitmap.close();
    return fetchFailedCoverNotice(error);
  }
}

/** Boundary: always settles with the notice to show next to "video saved". */
export async function fetchVideoCoverNotice({ itemId, file }: { itemId: string; file: File }): Promise<CoverNotice> {
  const frame = await fetchCoverFrame(file);
  if (!frame.isCaptured) return fetchMissedFrameNotice(frame);
  return fetchSavedCoverNotice({ itemId, bitmap: frame.bitmap });
}

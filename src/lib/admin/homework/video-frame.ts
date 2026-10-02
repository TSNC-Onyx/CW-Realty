import { getIsNearBlack, SAMPLE_HEIGHT, SAMPLE_WIDTH } from "@/lib/admin/homework/frame-brightness";

// Browser side of automatic video covers (docs/cwr-video-auto-cover-plan.md): open the
// admin's own file (nothing is uploaded for this), take the frame at 0:00, and if it is
// almost black take the frame at 1 second instead. Every outcome frees the video.

export type CoverFrame =
  | { isCaptured: true; bitmap: ImageBitmap; second: number }
  | { isCaptured: false; reason: CoverFrameMissReason; detail: string };

export type CoverFrameMissReason = "black" | "unreadable" | "timeout";

// Same limit as reading the video's length before upload.
const CAPTURE_TIMEOUT_MS = 15_000;
const FIRST_SECOND = 0;
const FALLBACK_SECOND = 1;
// Matches the largest saved photo width (photo-layout.json).
const MAX_FRAME_WIDTH = 1920;

class FrameReadError extends Error {
  constructor(readonly reason: Exclude<CoverFrameMissReason, "black">, detail: string) {
    super(detail);
    this.name = "FrameReadError";
  }
}

function getMediaErrorDetail(video: HTMLVideoElement): string {
  return video.error ? `MediaError ${video.error.code}: ${video.error.message}` : "The video could not be read.";
}

function getHasData(video: HTMLVideoElement): boolean {
  return video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
}

function getHasPicture(video: HTMLVideoElement): boolean {
  return video.videoWidth > 0 && video.videoHeight > 0;
}

function getReadError(video: HTMLVideoElement): FrameReadError {
  return new FrameReadError("unreadable", getMediaErrorDetail(video));
}

// Data without a picture means a sound-only file: there is nothing to make a cover from.
function getFrameState(video: HTMLVideoElement): "ready" | "no_picture" | "waiting" {
  if (!getHasData(video)) return "waiting";
  return getHasPicture(video) ? "ready" : "no_picture";
}

/** Resolves once the current position has a decoded frame; rejects if the browser can't decode the video. */
function waitForCurrentFrame(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleReady = () => {
      const state = getFrameState(video);
      if (state === "ready") resolve();
      if (state === "no_picture") reject(new FrameReadError("unreadable", "The file has sound but no picture"));
    };
    if (video.error) return reject(getReadError(video));
    ["loadeddata", "canplay", "seeked", "timeupdate"].forEach((eventName) => video.addEventListener(eventName, handleReady));
    video.addEventListener("error", () => reject(getReadError(video)), { once: true });
    handleReady();
  });
}

function seekTo(video: HTMLVideoElement, second: number): Promise<void> {
  return new Promise((resolve, reject) => {
    video.addEventListener("seeked", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(getReadError(video)), { once: true });
    video.currentTime = second;
  });
}

function drawFrame(video: HTMLVideoElement, { width, height }: { width: number; height: number }): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(video, 0, 0, width, height);
  return canvas;
}

function getIsFrameBlack(video: HTMLVideoElement): boolean {
  const sample = drawFrame(video, { width: SAMPLE_WIDTH, height: SAMPLE_HEIGHT });
  const pixels = sample.getContext("2d")?.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data;
  return pixels ? getIsNearBlack(pixels) : true;
}

async function getFrameBitmap(video: HTMLVideoElement): Promise<ImageBitmap> {
  const width = Math.min(video.videoWidth, MAX_FRAME_WIDTH);
  const height = Math.round((video.videoHeight * width) / video.videoWidth);
  return createImageBitmap(drawFrame(video, { width, height }));
}

/** The picture at `second`, or null when it is almost black. */
async function fetchFrameAt(video: HTMLVideoElement, second: number): Promise<ImageBitmap | null> {
  if (second !== FIRST_SECOND) await seekTo(video, second);
  await waitForCurrentFrame(video);
  return getIsFrameBlack(video) ? null : getFrameBitmap(video);
}

/** The 0:00 frame, or the 1-second frame when 0:00 is black; fetchFrame returns null for a black frame. */
export async function fetchUsableFrame({ durationSeconds, fetchFrame }: { durationSeconds: number; fetchFrame: (second: number) => Promise<ImageBitmap | null> }): Promise<CoverFrame> {
  const opening = await fetchFrame(FIRST_SECOND);
  if (opening) return { isCaptured: true, bitmap: opening, second: FIRST_SECOND };
  if (!(durationSeconds > FALLBACK_SECOND)) return { isCaptured: false, reason: "black", detail: "The opening frame is black and the video is under 1 second" };
  const fallback = await fetchFrame(FALLBACK_SECOND);
  if (fallback) return { isCaptured: true, bitmap: fallback, second: FALLBACK_SECOND };
  return { isCaptured: false, reason: "black", detail: "The frames at 0:00 and 1 second are both black" };
}

async function fetchFirstUsableFrame(video: HTMLVideoElement): Promise<CoverFrame> {
  await waitForCurrentFrame(video);
  return fetchUsableFrame({ durationSeconds: video.duration, fetchFrame: (second) => fetchFrameAt(video, second) });
}

// A frame that arrives after the time limit is never used, so its memory is freed.
function closeLateFrame(capture: Promise<CoverFrame>): void {
  capture.then((frame) => (frame.isCaptured ? frame.bitmap.close() : undefined)).catch(() => undefined);
}

function getTimeLimit(): { expired: Promise<never>; clear: () => void } {
  let timer = 0;
  const expired = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new FrameReadError("timeout", `No usable frame after ${CAPTURE_TIMEOUT_MS} ms`)), CAPTURE_TIMEOUT_MS);
  });
  return { expired, clear: () => window.clearTimeout(timer) };
}

function getMissedFrame(error: unknown): CoverFrame {
  if (error instanceof FrameReadError) return { isCaptured: false, reason: error.reason, detail: error.message };
  return { isCaptured: false, reason: "unreadable", detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
}

function openVideo(url: string): HTMLVideoElement {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  return video;
}

function releaseVideo(video: HTMLVideoElement, url: string): void {
  video.removeAttribute("src");
  video.load();
  URL.revokeObjectURL(url);
}

/** Boundary for the capture: always settles with a frame or the reason there isn't one. */
export async function fetchCoverFrame(file: File): Promise<CoverFrame> {
  const url = URL.createObjectURL(file);
  const video = openVideo(url);
  const timeLimit = getTimeLimit();
  const capture = fetchFirstUsableFrame(video);
  try {
    return await Promise.race([capture, timeLimit.expired]);
  } catch (error) {
    if (error instanceof FrameReadError && error.reason === "timeout") closeLateFrame(capture);
    return getMissedFrame(error);
  } finally {
    timeLimit.clear();
    releaseVideo(video, url);
  }
}

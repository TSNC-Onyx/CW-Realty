import { describe, expect, it, vi } from "vitest";

import { fetchUsableFrame } from "@/lib/admin/homework/video-frame";

// A stand-in picture; the real one comes from the browser.
const PICTURE = { width: 320, height: 180, close: () => undefined } as ImageBitmap;
const BLACK = null;

function getFrameReader(framesBySecond: Record<number, ImageBitmap | null>) {
  return vi.fn(async (second: number) => framesBySecond[second] ?? BLACK);
}

describe("choosing the cover frame", () => {
  it("uses 0:00 when it shows a picture, without looking further", async () => {
    // Arrange
    const fetchFrame = getFrameReader({ 0: PICTURE });

    // Act
    const frame = await fetchUsableFrame({ durationSeconds: 60, fetchFrame });

    // Assert
    expect({ frame, calls: fetchFrame.mock.calls.length }).toEqual({ frame: { isCaptured: true, bitmap: PICTURE, second: 0 }, calls: 1 });
  });

  it("uses the frame at 1 second when 0:00 is black", async () => {
    // Arrange
    const fetchFrame = getFrameReader({ 0: BLACK, 1: PICTURE });

    // Act
    const frame = await fetchUsableFrame({ durationSeconds: 60, fetchFrame });

    // Assert
    expect(frame).toEqual({ isCaptured: true, bitmap: PICTURE, second: 1 });
  });

  it("makes no cover when 0:00 and 1 second are both black", async () => {
    // Arrange
    const fetchFrame = getFrameReader({ 0: BLACK, 1: BLACK });

    // Act
    const frame = await fetchUsableFrame({ durationSeconds: 60, fetchFrame });

    // Assert
    expect(frame).toMatchObject({ isCaptured: false, reason: "black" });
  });

  it("does not look past the end of a video shorter than 1 second", async () => {
    // Arrange
    const fetchFrame = getFrameReader({ 0: BLACK, 1: PICTURE });

    // Act
    const frame = await fetchUsableFrame({ durationSeconds: 0.5, fetchFrame });

    // Assert
    expect({ isCaptured: frame.isCaptured, seconds: fetchFrame.mock.calls.map(([second]) => second) }).toEqual({ isCaptured: false, seconds: [0] });
  });

  it("passes a read failure on to the caller, which reports it", async () => {
    // Arrange
    const fetchFrame = vi.fn(async () => {
      throw new Error("decode failed");
    });

    // Act
    const capture = fetchUsableFrame({ durationSeconds: 60, fetchFrame });

    // Assert
    await expect(capture).rejects.toThrow("decode failed");
  });
});

import { describe, expect, it } from "vitest";

import { getIsNearBlack, SAMPLE_HEIGHT, SAMPLE_WIDTH } from "@/lib/admin/homework/frame-brightness";

const PIXEL_COUNT = SAMPLE_WIDTH * SAMPLE_HEIGHT;
type Rgb = [number, number, number];

function getFrame({ base, highlight, highlightCount }: { base: Rgb; highlight?: Rgb; highlightCount?: number }): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(PIXEL_COUNT * 4);
  for (let pixel = 0; pixel < PIXEL_COUNT; pixel += 1) {
    const [red, green, blue] = highlight && pixel < (highlightCount ?? 0) ? highlight : base;
    rgba.set([red, green, blue, 255], pixel * 4);
  }
  return rgba;
}

describe("near-black frames", () => {
  it("treats a pure black frame as black", () => {
    // Arrange
    const frame = getFrame({ base: [0, 0, 0] });

    // Act
    const isNearBlack = getIsNearBlack(frame);

    // Assert
    expect(isNearBlack).toBe(true);
  });

  it("treats video black (16 of 255) with faint noise as black", () => {
    // Arrange: a fade-in start, with 1% of pixels slightly brighter
    const frame = getFrame({ base: [16, 16, 16], highlight: [40, 40, 40], highlightCount: Math.floor(PIXEL_COUNT * 0.01) });

    // Act
    const isNearBlack = getIsNearBlack(frame);

    // Assert
    expect(isNearBlack).toBe(true);
  });

  it("keeps a dark night scene with lit windows as a picture", () => {
    // Arrange: mostly dark, with 5% warm window light
    const frame = getFrame({ base: [10, 12, 20], highlight: [230, 190, 120], highlightCount: Math.floor(PIXEL_COUNT * 0.05) });

    // Act
    const isNearBlack = getIsNearBlack(frame);

    // Assert
    expect(isNearBlack).toBe(false);
  });

  it("keeps a normal daylight frame as a picture", () => {
    // Arrange
    const frame = getFrame({ base: [127, 167, 217] });

    // Act
    const isNearBlack = getIsNearBlack(frame);

    // Assert
    expect(isNearBlack).toBe(false);
  });

  it("treats a frame exactly at the 98% dark line as black", () => {
    // Arrange: 2% of pixels bright, rounded down so the dark share is at least 98%
    const frame = getFrame({ base: [0, 0, 0], highlight: [255, 255, 255], highlightCount: Math.floor(PIXEL_COUNT * 0.02) });

    // Act
    const isNearBlack = getIsNearBlack(frame);

    // Assert
    expect(isNearBlack).toBe(true);
  });

  it("keeps a frame just past the 98% line as a picture", () => {
    // Arrange: one more bright pixel than the line allows
    const frame = getFrame({ base: [0, 0, 0], highlight: [255, 255, 255], highlightCount: Math.floor(PIXEL_COUNT * 0.02) + 1 });

    // Act
    const isNearBlack = getIsNearBlack(frame);

    // Assert
    expect(isNearBlack).toBe(false);
  });

  it("judges brightness by how people see it: dark blue stays dark", () => {
    // Arrange: blue counts least toward brightness, so deep blue reads as dark
    const frame = getFrame({ base: [0, 0, 120] });

    // Act
    const isNearBlack = getIsNearBlack(frame);

    // Assert
    expect(isNearBlack).toBe(true);
  });
});

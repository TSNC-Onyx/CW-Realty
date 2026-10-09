import { describe, expect, it } from "vitest";

import { getClampedIndex, getIndexFromScroll } from "@/components/content/use-photo-track";

describe("which photo the gallery is showing", () => {
  it.each([
    ["the first photo", 0, 0],
    ["the third photo", 1600, 2],
    ["a swipe that stopped just short of the next photo", 1150, 1],
    ["past the last photo", 9999, 7],
  ])("reads %s from the scroll position", (_label, scrollLeft, expected) => {
    // Act
    const index = getIndexFromScroll({ scrollLeft, slideWidth: 800, count: 8 });

    // Assert
    expect(index).toBe(expected);
  });

  it("stays on the first photo while the gallery has no width yet", () => {
    // Act
    const index = getIndexFromScroll({ scrollLeft: 500, slideWidth: 0, count: 8 });

    // Assert
    expect(index).toBe(0);
  });

  it.each([
    ["before the first photo", -1, 0],
    ["after the last photo", 8, 7],
    ["a photo in between", 4, 4],
  ])("keeps a move %s inside the gallery", (_label, index, expected) => {
    // Act
    const clamped = getClampedIndex({ index, count: 8 });

    // Assert
    expect(clamped).toBe(expected);
  });

  it("handles a gallery with one photo", () => {
    // Act
    const clamped = getClampedIndex({ index: 3, count: 1 });

    // Assert
    expect(clamped).toBe(0);
  });
});

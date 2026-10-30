import { describe, expect, it } from "vitest";

import { getMovedItems } from "@/lib/admin/moved-items";

const PHOTOS = ["front", "kitchen", "bedroom", "yard"];

describe("getMovedItems", () => {
  it("moves an item later and shifts the ones between earlier", () => {
    // Arrange
    const move = { from: 0, to: 2 };

    // Act
    const moved = getMovedItems(PHOTOS, move);

    // Assert
    expect(moved).toEqual(["kitchen", "bedroom", "front", "yard"]);
  });

  it("moves an item earlier and shifts the ones between later", () => {
    // Arrange
    const move = { from: 3, to: 1 };

    // Act
    const moved = getMovedItems(PHOTOS, move);

    // Assert
    expect(moved).toEqual(["front", "yard", "kitchen", "bedroom"]);
  });

  it("leaves the original list as it was", () => {
    // Arrange
    const original = [...PHOTOS];

    // Act
    getMovedItems(PHOTOS, { from: 0, to: 3 });

    // Assert
    expect(PHOTOS).toEqual(original);
  });

  it.each([
    { from: -1, to: 0 },
    { from: 0, to: 4 },
    { from: 1, to: 1 },
  ])("keeps the order for an impossible move $from → $to", (move) => {
    // Arrange
    const items = PHOTOS;

    // Act
    const moved = getMovedItems(items, move);

    // Assert
    expect(moved).toEqual(PHOTOS);
  });
});

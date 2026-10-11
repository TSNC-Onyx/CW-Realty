import { describe, expect, it } from "vitest";

import { getSavedState } from "@/lib/admin/saved-state";

describe("getSavedState", () => {
  it("is saved when the box matches the stored value", () => {
    // Arrange
    const field = { current: "Greensboro", saved: "Greensboro" };

    // Act
    const state = getSavedState(field);

    // Assert
    expect(state).toBe("saved");
  });

  it("ignores spaces at the ends, as the server trims them", () => {
    // Arrange
    const field = { current: "  Greensboro ", saved: "Greensboro" };

    // Act
    const state = getSavedState(field);

    // Assert
    expect(state).toBe("saved");
  });

  it("is unsaved when the box differs from the stored value", () => {
    // Arrange
    const field = { current: "High Point", saved: "Greensboro" };

    // Act
    const state = getSavedState(field);

    // Assert
    expect(state).toBe("unsaved");
  });

  it("counts a change of letter case as unsaved unless the field ignores case", () => {
    // Arrange
    const field = { current: "gtm-ab12cd3", saved: "GTM-AB12CD3" };

    // Act
    const states = [getSavedState(field), getSavedState({ ...field, isCaseInsensitive: true })];

    // Assert
    expect(states).toEqual(["unsaved", "saved"]);
  });

  it("is empty when nothing is stored and nothing is typed", () => {
    // Arrange
    const field = { current: " ", saved: "" };

    // Act
    const state = getSavedState(field);

    // Assert
    expect(state).toBe("empty");
  });

  it("is empty when the caller says the stored value is blank, even with a value shown", () => {
    // Arrange
    const field = { current: "user-1", saved: "user-1", isSavedBlank: true };

    // Act
    const state = getSavedState(field);

    // Assert
    expect(state).toBe("empty");
  });

  it("shows nothing on a new item until something is typed", () => {
    // Arrange
    const untouched = { current: "", saved: "", isNewItem: true };

    // Act
    const states = [getSavedState(untouched), getSavedState({ ...untouched, current: "12 Elm St" })];

    // Assert
    expect(states).toEqual(["none", "unsaved"]);
  });
});

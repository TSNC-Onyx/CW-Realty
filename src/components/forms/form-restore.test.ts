import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isRefreshLoop, refreshKeepingValues, takeRestoredValues } from "@/components/forms/form-restore";

function getMemoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

describe("keeping typed text across a refresh", () => {
  const reload = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("window", { sessionStorage: getMemoryStorage(), location: { reload } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("puts back what was typed after the refresh", () => {
    // Arrange
    refreshKeepingValues({ formId: "contact-form", values: { message: "Hello", email: "a@example.com" } });

    // Act
    const restored = takeRestoredValues({ formId: "contact-form", fieldNames: ["message", "email"] });

    // Assert
    expect(restored).toEqual({ message: "Hello", email: "a@example.com" });
  });

  it("puts it back only once", () => {
    // Arrange
    refreshKeepingValues({ formId: "contact-form", values: { message: "Hello" } });
    takeRestoredValues({ formId: "contact-form", fieldNames: ["message"] });

    // Act
    const restored = takeRestoredValues({ formId: "contact-form", fieldNames: ["message"] });

    // Assert
    expect(restored).toBeNull();
  });

  it("skips a field a release renamed", () => {
    // Arrange
    refreshKeepingValues({ formId: "contact-form", values: { message: "Hello", oldName: "x" } });

    // Act
    const restored = takeRestoredValues({ formId: "contact-form", fieldNames: ["message", "newName"] });

    // Assert
    expect(restored).toEqual({ message: "Hello" });
  });

  it("drops what was saved more than 10 minutes ago", () => {
    // Arrange
    vi.useFakeTimers();
    refreshKeepingValues({ formId: "contact-form", values: { message: "Hello" } });
    vi.advanceTimersByTime(11 * 60 * 1000);

    // Act
    const restored = takeRestoredValues({ formId: "contact-form", fieldNames: ["message"] });

    // Assert
    expect(restored).toBeNull();
  });

  it("notices when one refresh in the last minute didn't fix the page", () => {
    // Arrange
    refreshKeepingValues({ formId: "admin-login", values: { email: "a@example.com" } });

    // Act
    const isLoop = isRefreshLoop();

    // Assert
    expect(isLoop).toBe(true);
  });

  it("still refreshes when the browser blocks storage", () => {
    // Arrange
    vi.stubGlobal("window", {
      sessionStorage: { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => undefined },
      location: { reload },
    });
    reload.mockClear();

    // Act
    refreshKeepingValues({ formId: "contact-form", values: { message: "Hello" } });

    // Assert
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

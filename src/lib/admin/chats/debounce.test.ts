import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDebouncer } from "@/lib/admin/chats/debounce";

const WAIT_MS = 300;

describe("createDebouncer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits until calls have stopped for the full wait", () => {
    // Arrange
    const callback = vi.fn();
    const debouncer = createDebouncer({ callback, waitMs: WAIT_MS });

    // Act
    debouncer.call("r");
    vi.advanceTimersByTime(WAIT_MS - 1);

    // Assert
    expect(callback).not.toHaveBeenCalled();
  });

  it("runs once with the last value after typing stops", () => {
    // Arrange
    const callback = vi.fn();
    const debouncer = createDebouncer({ callback, waitMs: WAIT_MS });

    // Act
    debouncer.call("r");
    vi.advanceTimersByTime(WAIT_MS - 1);
    debouncer.call("re");
    vi.advanceTimersByTime(WAIT_MS - 1);
    debouncer.call("rent");
    vi.advanceTimersByTime(WAIT_MS);

    // Assert
    expect(callback.mock.calls).toEqual([["rent"]]);
  });

  it("runs nothing after it is cancelled", () => {
    // Arrange
    const callback = vi.fn();
    const debouncer = createDebouncer({ callback, waitMs: WAIT_MS });

    // Act
    debouncer.call("rent");
    debouncer.cancel();
    vi.advanceTimersByTime(WAIT_MS);

    // Assert
    expect(callback).not.toHaveBeenCalled();
  });
});

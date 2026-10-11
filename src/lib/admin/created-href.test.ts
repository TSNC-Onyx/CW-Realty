import { describe, expect, it } from "vitest";

import { getCreatedHref, getMissedCount } from "@/lib/admin/created-href";

const EDIT_PATH = "/admin/listings";
const RECORD_ID = "5b1c1c43-1f7a-4c39-9a52-2a7f3c0d6e11";

describe("getCreatedHref", () => {
  it("opens the new record with the saved message when every file uploaded", () => {
    // Arrange
    const options = { editPath: EDIT_PATH, recordId: RECORD_ID, missedCount: 0 };

    // Act
    const href = getCreatedHref(options);

    // Assert
    expect(href).toBe(`${EDIT_PATH}/${RECORD_ID}?created=1`);
  });

  it("adds how many files didn't upload", () => {
    // Arrange
    const options = { editPath: EDIT_PATH, recordId: RECORD_ID, missedCount: 2 };

    // Act
    const href = getCreatedHref(options);

    // Assert
    expect(href).toBe(`${EDIT_PATH}/${RECORD_ID}?created=1&missed=2`);
  });
});

describe("getMissedCount", () => {
  it("reads a small positive count", () => {
    // Arrange
    const missed = "3";

    // Act
    const count = getMissedCount(missed);

    // Assert
    expect(count).toBe(3);
  });

  it.each([undefined, "", "0", "-1", "1.5", "abc", "1000", "01"])("treats %s as nothing missed", (missed) => {
    // Arrange
    const value = missed;

    // Act
    const count = getMissedCount(value);

    // Assert
    expect(count).toBe(0);
  });
});

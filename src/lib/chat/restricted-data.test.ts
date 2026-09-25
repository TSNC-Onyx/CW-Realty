import { describe, expect, it } from "vitest";

import { REMOVED_NUMBER_TEXT, getRedactedText, hasRestrictedNumber } from "@/lib/chat/restricted-data";

describe("hasRestrictedNumber", () => {
  it.each([
    "My SSN is 123-45-6789",
    "ssn 123 45 6789",
    "123.45.6789",
    "123 - 45 - 6789",
    "card 4111 1111 1111 1111",
    "4111.1111.1111.1111",
    "account 000123456789012",
    "My checking account is 1234567890, can you help?",
    "routing: 021000021",
    "Driver license # 40912345",
    "My ID number is 88812345",
  ])("flags %s", (text) => {
    // Arrange / Act
    const isFlagged = hasRestrictedNumber(text);

    // Assert
    expect(isFlagged).toBe(true);
  });

  it.each(["Call me at (336) 555-0123", "+1 336 555 0123", "336.555.0123", "Is 1204 Oak St still $350,000?", "ZIP 27401", "Built in 1998 on 0.25 acres", "Homes near 27410-1234?", "Is listing id 100234 still available?", "MLS 1234567"])("allows %s", (text) => {
    // Arrange / Act
    const isFlagged = hasRestrictedNumber(text);

    // Assert
    expect(isFlagged).toBe(false);
  });
});

describe("getRedactedText", () => {
  it("replaces every restricted number and keeps the rest", () => {
    // Arrange
    const text = "SSN 123-45-6789 and card 4111-1111-1111-1111, phone 336-555-0123";

    // Act
    const redacted = getRedactedText(text);

    // Assert
    expect(redacted).toBe(`SSN ${REMOVED_NUMBER_TEXT} and card ${REMOVED_NUMBER_TEXT}, phone 336-555-0123`);
  });
});

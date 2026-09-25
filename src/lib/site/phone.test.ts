import { describe, expect, it } from "vitest";

import { getCallHref, getDisplayPhone, getE164Phone, getTextHref } from "@/lib/site/phone";

describe("getE164Phone", () => {
  it.each([
    ["(336) 708-0560", "+13367080560"],
    ["336.708.0560", "+13367080560"],
    ["1-336-708-0560", "+13367080560"],
    ["+1 336 708 0560", "+13367080560"],
  ])("reads %s as a US number", (typed, expected) => {
    // Arrange
    const input = typed;

    // Act
    const phone = getE164Phone(input);

    // Assert
    expect(phone).toBe(expected);
  });

  it.each(["708-0560", "(036) 708-0560", "336-708-05601", "call me"])("rejects %s", (typed) => {
    // Arrange
    const input = typed;

    // Act
    const phone = getE164Phone(input);

    // Assert
    expect(phone).toBeNull();
  });
});

describe("phone display and links", () => {
  it("formats a stored number for reading", () => {
    // Arrange
    const phone = "+13367080560" as const;

    // Act
    const display = getDisplayPhone(phone);

    // Assert
    expect(display).toBe("(336) 708-0560");
  });

  it("builds tap-to-call and tap-to-text links", () => {
    // Arrange
    const phone = "+13367080560" as const;

    // Act
    const hrefs = [getCallHref(phone), getTextHref(phone)];

    // Assert
    expect(hrefs).toEqual(["tel:+13367080560", "sms:+13367080560"]);
  });
});

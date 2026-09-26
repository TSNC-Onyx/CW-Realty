import { describe, expect, it } from "vitest";

import { getClosedDealSchema, getOfficeToday } from "@/lib/admin/closed-deals/closed-deal-schema";

// 2 a.m. UTC on Sept 26 is still Sept 25 at the office in North Carolina.
const NOW = new Date("2026-09-26T02:00:00Z");

describe("getOfficeToday", () => {
  it("uses the office's date, not the server's", () => {
    // Arrange / Act
    const today = getOfficeToday(NOW);

    // Assert
    expect(today).toBe("2026-09-25");
  });
});

describe("closed deal", () => {
  it.each([
    ["350,000", 35000000],
    ["$350,000.50", 35000050],
    ["", null],
  ])("reads the sale price %s as %s cents", (salePrice, expected) => {
    // Arrange / Act
    const parsed = getClosedDealSchema(NOW).safeParse({ closedOn: "2026-09-20", salePrice });

    // Assert
    expect(parsed.data?.salePrice).toBe(expected);
  });

  it.each([
    [{ closedOn: "2026-09-26", salePrice: "" }, "The closing date can't be in the future"],
    [{ closedOn: "", salePrice: "" }, "Enter the closing date"],
    [{ closedOn: "2026-09-20", salePrice: "about 300k" }, "Enter the sale price in dollars, like 350,000"],
  ])("explains what to fix for %j", (input, message) => {
    // Arrange / Act
    const parsed = getClosedDealSchema(NOW).safeParse(input);

    // Assert
    expect(parsed.error?.issues[0]?.message).toBe(message);
  });
});

import { describe, expect, it } from "vitest";

import { isTagReviewDue } from "@/lib/admin/tracking/tag-review";
import { trackingSettingsSchema } from "@/lib/admin/tracking/tracking-schema";

const NOW = new Date("2026-09-25T12:00:00Z");

describe("trackingSettingsSchema", () => {
  it("accepts a lowercase container ID and blank Pixel ID", () => {
    // Arrange / Act
    const parsed = trackingSettingsSchema.safeParse({ gtmContainerId: " gtm-ab12cd3 ", metaPixelId: "" });

    // Assert
    expect(parsed.data).toEqual({ gtmContainerId: "GTM-AB12CD3", metaPixelId: null });
  });

  it.each([
    [{ gtmContainerId: "UA-12345", metaPixelId: "" }, "gtmContainerId"],
    [{ gtmContainerId: "", metaPixelId: "12 34" }, "metaPixelId"],
  ])("rejects a wrong ID in %j", (input, field) => {
    // Arrange / Act
    const parsed = trackingSettingsSchema.safeParse(input);

    // Assert
    expect(parsed.error?.issues[0]?.path).toEqual([field]);
  });
});

describe("isTagReviewDue", () => {
  it.each([
    [null, true],
    ["2026-07-01T12:00:00Z", false],
    ["2026-06-01T12:00:00Z", true],
  ])("after a review on %s is %s", (reviewedAt, expected) => {
    // Arrange / Act
    const isDue = isTagReviewDue({ reviewedAt, now: NOW });

    // Assert
    expect(isDue).toBe(expected);
  });
});

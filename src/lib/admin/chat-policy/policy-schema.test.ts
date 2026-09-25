import { describe, expect, it } from "vitest";

import { policyBodySchema } from "@/lib/admin/chat-policy/policy-schema";

describe("policyBodySchema", () => {
  it("accepts a policy with at least one heading", () => {
    // Arrange / Act
    const result = policyBodySchema.safeParse("# Office hours\nWeekdays 9 to 5.");

    // Assert
    expect(result.success).toBe(true);
  });

  it("asks for a heading when the policy has none", () => {
    // Arrange / Act
    const result = policyBodySchema.safeParse("Weekdays 9 to 5.");

    // Assert
    expect(result.error?.issues[0]?.message).toMatch(/^Add at least one section heading/);
  });
});

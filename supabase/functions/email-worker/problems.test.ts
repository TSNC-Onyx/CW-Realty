import { describe, expect, it } from "vitest";

import { getReference as getSiteReference } from "@/lib/observability/reference";

import { getReference } from "./problems.ts";

describe("email-worker problem references", () => {
  it.each(["00000000-0000-4000-8000-000000000000", "7f3a9c21-1b2c-4d5e-8f90-abcdef012345", "ffffffff-ffff-4fff-bfff-ffffffffffff"])("match the site's for %s", (id) => {
    // Assert
    expect(getReference(id)).toBe(getSiteReference(id));
  });
});

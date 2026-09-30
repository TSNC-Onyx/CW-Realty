import { describe, expect, it } from "vitest";

import { getReference, getReferenceSuffix } from "@/lib/observability/reference";

describe("reference codes", () => {
  it("are readable groups without easily confused letters", () => {
    // Act
    const reference = getReference(crypto.randomUUID());

    // Assert
    expect(reference).toMatch(/^CWR-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{3}-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{3}$/);
  });

  it("are the same for the same problem", () => {
    // Arrange
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e";

    // Act
    const references = [getReference(id), getReference(id)];

    // Assert
    expect(references[0]).toBe(references[1]);
  });

  it("say when the problem may not have been saved", () => {
    // Act
    const suffix = getReferenceSuffix({ reference: "CWR-AAA-BBB", isStored: false });

    // Assert
    expect(suffix).toBe(" (Ref CWR-AAA-BBB — may not be saved)");
  });
});

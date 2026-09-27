import { describe, expect, it } from "vitest";

import { getCategoriesHeading, type Connection } from "@/lib/content/connections";

function buildConnection(overrides: Partial<Connection>): Connection {
  return { id: "id", fullName: "Name", category: "Other", titleLine: "", phone: null, email: null, website: null, photo: null, ...overrides };
}

describe("getCategoriesHeading", () => {
  it("joins two categories with and, in the category list order", () => {
    // Arrange
    const connections = [buildConnection({ category: "Insurance" }), buildConnection({ category: "Lending" }), buildConnection({ category: "Insurance" })];

    // Act
    const heading = getCategoriesHeading(connections);

    // Assert
    expect(heading).toBe("Lending and insurance");
  });

  it("uses a serial comma for three or more", () => {
    // Arrange
    const connections = [buildConnection({ category: "Lending" }), buildConnection({ category: "Insurance" }), buildConnection({ category: "Home warranty" })];

    // Act
    const heading = getCategoriesHeading(connections);

    // Assert
    expect(heading).toBe("Lending, insurance, and home warranty");
  });

  it("names a single category on its own", () => {
    // Arrange
    const connections = [buildConnection({ category: "Design and staging" })];

    // Act
    const heading = getCategoriesHeading(connections);

    // Assert
    expect(heading).toBe("Design and staging");
  });
});

import { describe, expect, it } from "vitest";

import { getDisplayPrice, getListingFacts, getParagraphs } from "@/lib/content/format";

describe("listing formatting", () => {
  it("shows prices in whole dollars", () => {
    // Arrange
    const priceCents = 22500000;

    // Act
    const price = getDisplayPrice(priceCents);

    // Assert
    expect(price).toBe("$225,000");
  });

  it("describes a home's size in words", () => {
    // Arrange
    const size = { bedrooms: 3, bathrooms: 1.5, squareFeet: 1050 };

    // Act
    const labels = getListingFacts(size).map((fact) => fact.label);

    // Assert
    expect(labels).toEqual(["3 beds", "1.5 baths", "1,050 sq ft"]);
  });

  it("uses singular words for one bedroom and one bath", () => {
    // Arrange
    const size = { bedrooms: 1, bathrooms: 1, squareFeet: null };

    // Act
    const labels = getListingFacts(size).map((fact) => fact.label);

    // Assert
    expect(labels).toEqual(["1 bed", "1 bath"]);
  });

  it("shows only the facts a commercial property has", () => {
    // Arrange
    const size = { bedrooms: null, bathrooms: null, squareFeet: 4986 };

    // Act
    const labels = getListingFacts(size).map((fact) => fact.label);

    // Assert
    expect(labels).toEqual(["4,986 sq ft"]);
  });

  it("splits stored text into paragraphs on blank lines", () => {
    // Arrange
    const text = "First paragraph.\n\n  Second paragraph.\n\n\n";

    // Act
    const paragraphs = getParagraphs(text);

    // Assert
    expect(paragraphs).toEqual(["First paragraph.", "Second paragraph."]);
  });
});

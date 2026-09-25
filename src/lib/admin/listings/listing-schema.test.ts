import { describe, expect, it } from "vitest";

import { listingSchema } from "@/lib/admin/listings/listing-schema";

const VALID_LISTING = {
  streetAddress: "5423 Pine Level Dr",
  city: "Browns Summit",
  state: "nc",
  postalCode: "27214",
  price: "$225,000",
  bedrooms: "3",
  bathrooms: "1.5",
  squareFeet: "1,050",
  description: "Quiet country living.",
  slug: "",
};

describe("listing rules", () => {
  it("reads a typed price and fills the web address from the address", () => {
    // Arrange
    const values = VALID_LISTING;

    // Act
    const parsed = listingSchema.parse(values);

    // Assert
    expect(parsed).toMatchObject({ price: 22500000, state: "NC", squareFeet: 1050, bathrooms: 1.5, slug: "5423-pine-level-dr-browns-summit-nc" });
  });

  it("leaves blank sizes empty for a commercial property", () => {
    // Arrange
    const values = { ...VALID_LISTING, bedrooms: "", bathrooms: "", squareFeet: "" };

    // Act
    const parsed = listingSchema.parse(values);

    // Assert
    expect([parsed.bedrooms, parsed.bathrooms, parsed.squareFeet]).toEqual([null, null, null]);
  });

  it.each([
    ["price", "free"],
    ["price", "0"],
    ["bathrooms", "2.25"],
    ["postalCode", "2721"],
    ["description", "   "],
    ["slug", "Not A Slug"],
  ])("rejects %s = %s", (field, value) => {
    // Arrange
    const values = { ...VALID_LISTING, [field]: value };

    // Act
    const result = listingSchema.safeParse(values);

    // Assert
    expect(result.success ? [] : result.error.issues.map((issue) => issue.path[0])).toContain(field);
  });
});

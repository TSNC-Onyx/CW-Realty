import { describe, expect, it } from "vitest";

import { getPageCanonical, getPageNumber, getTotalPages } from "@/lib/content/page-number";

describe("getPageNumber", () => {
  it.each([
    [undefined, 1],
    ["1", 1],
    ["12", 12],
    ["0", null],
    ["-1", null],
    ["abc", null],
    ["1.5", null],
    ["99999", null],
    [["1", "2"], null],
  ])("%s → %s", (rawPage, expected) => {
    // Arrange
    const input = rawPage;

    // Act
    const page = getPageNumber(input);

    // Assert
    expect(page).toBe(expected);
  });
});

describe("getTotalPages", () => {
  it("counts an empty list as one page so the empty state shows", () => {
    // Arrange
    const totalCount = 0;

    // Act
    const totalPages = getTotalPages(totalCount, 12);

    // Assert
    expect(totalPages).toBe(1);
  });

  it("rounds up a partly filled last page", () => {
    // Arrange
    const totalCount = 13;

    // Act
    const totalPages = getTotalPages(totalCount, 12);

    // Assert
    expect(totalPages).toBe(2);
  });
});

describe("getPageCanonical", () => {
  it.each([
    { page: 1, totalPages: 3, canonical: "/listings" },
    { page: 2, totalPages: 3, canonical: "/listings?page=2" },
    { page: 3, totalPages: 3, canonical: "/listings?page=3" },
    { page: 4, totalPages: 3, canonical: null },
    { page: null, totalPages: 3, canonical: null },
  ])("page $page of $totalPages → $canonical", ({ page, totalPages, canonical }) => {
    // Act
    const result = getPageCanonical({ basePath: "/listings", page, totalPages });

    // Assert
    expect(result).toBe(canonical);
  });
});

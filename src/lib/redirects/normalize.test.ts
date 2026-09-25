import { describe, expect, it } from "vitest";

import { getNormalizedUrl } from "@/lib/redirects/normalize";

function getNormalizedHref(href: string): string {
  return getNormalizedUrl(new URL(href)).href;
}

describe("getNormalizedUrl", () => {
  it("lowercases the path", () => {
    // Arrange
    const href = "https://www.charliewardrealty.com/About-Us";

    // Act
    const normalizedHref = getNormalizedHref(href);

    // Assert
    expect(normalizedHref).toBe("https://www.charliewardrealty.com/about-us");
  });

  it("removes trailing slashes", () => {
    // Arrange
    const href = "https://www.charliewardrealty.com/contact//";

    // Act
    const normalizedHref = getNormalizedHref(href);

    // Assert
    expect(normalizedHref).toBe("https://www.charliewardrealty.com/contact");
  });

  it("sends /home to the home page", () => {
    // Arrange
    const href = "https://www.charliewardrealty.com/Home/";

    // Act
    const normalizedHref = getNormalizedHref(href);

    // Assert
    expect(normalizedHref).toBe("https://www.charliewardrealty.com/");
  });

  it("moves the bare domain on http to https www in the same step", () => {
    // Arrange
    const href = "http://charliewardrealty.com/FAQ/";

    // Act
    const normalizedHref = getNormalizedHref(href);

    // Assert
    expect(normalizedHref).toBe("https://www.charliewardrealty.com/faq");
  });

  it("keeps the query string exactly as sent, so campaign tags survive", () => {
    // Arrange
    const href = "https://www.charliewardrealty.com/Contact/?utm_source=Google&utm_campaign=Spring";

    // Act
    const normalizedHref = getNormalizedHref(href);

    // Assert
    expect(normalizedHref).toBe("https://www.charliewardrealty.com/contact?utm_source=Google&utm_campaign=Spring");
  });

  it("leaves preview and local hosts on their own host and protocol", () => {
    // Arrange
    const href = "http://localhost:3000/About/";

    // Act
    const normalizedHref = getNormalizedHref(href);

    // Assert
    expect(normalizedHref).toBe("http://localhost:3000/about");
  });

  it("leaves file paths untouched so asset names are never changed", () => {
    // Arrange
    const href = "https://www.charliewardrealty.com/brand/CWR-Logo.webp";

    // Act
    const normalizedHref = getNormalizedHref(href);

    // Assert
    expect(normalizedHref).toBe(href);
  });

  it("does not change an already-normal URL", () => {
    // Arrange
    const href = "https://www.charliewardrealty.com/team/charlie-ward";

    // Act
    const normalizedHref = getNormalizedHref(href);

    // Assert
    expect(normalizedHref).toBe(href);
  });
});

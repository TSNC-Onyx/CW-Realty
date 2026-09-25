import { describe, expect, it } from "vitest";

import { MENU_SECTIONS, getAllMenuLinks, isCurrentPath, isCurrentSection } from "@/lib/site/navigation";

describe("menu", () => {
  it("has five or fewer top-level items (Style §4)", () => {
    // Arrange
    const maxTopLevelItems = 5;

    // Act
    const count = MENU_SECTIONS.length;

    // Assert
    expect(count).toBeLessThanOrEqual(maxTopLevelItems);
  });

  it("lists every page from the navigation reconciliation", () => {
    // Arrange
    const expectedPaths = ["/listings", "/property-search", "/services/cwr-touchup", "/team", "/resources", "/connections", "/about", "/contact"];

    // Act
    const paths = getAllMenuLinks().map((link) => link.href);

    // Assert
    expect(paths).toEqual(expectedPaths);
  });
});

describe("current page", () => {
  it("marks a section current on its child pages", () => {
    // Arrange
    const teamSection = MENU_SECTIONS.find((section) => section.label === "Team");

    // Act
    const isCurrent = teamSection ? isCurrentSection("/team/charlie-ward", teamSection) : false;

    // Assert
    expect(isCurrent).toBe(true);
  });

  it("does not match a page that only shares a prefix", () => {
    // Arrange
    const pathname = "/teamwork";

    // Act
    const isCurrent = isCurrentPath(pathname, "/team");

    // Assert
    expect(isCurrent).toBe(false);
  });

  it("marks the home link current only on the home page", () => {
    // Arrange
    const pathnames = ["/", "/about"];

    // Act
    const results = pathnames.map((pathname) => isCurrentPath(pathname, "/"));

    // Assert
    expect(results).toEqual([true, false]);
  });
});

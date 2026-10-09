import { describe, expect, it } from "vitest";

import {
  MENU_SECTIONS,
  STATIC_PAGE_PATHS,
  UNLISTED_PAGE_PATHS,
  getAllMenuLinks,
  getFooterColumns,
  getListedPagePaths,
  getMenuSections,
  isCurrentPath,
  isCurrentSection,
} from "@/lib/site/navigation";

describe("menu", () => {
  it("has six or fewer top-level items (Style §4)", () => {
    // Arrange
    const maxTopLevelItems = 6;

    // Act
    const count = MENU_SECTIONS.length;

    // Assert
    expect(count).toBeLessThanOrEqual(maxTopLevelItems);
  });

  it("lists every page from the navigation reconciliation", () => {
    // Arrange
    const expectedPaths = [
      "/listings",
      "/property-search",
      "/services/selected-services",
      "/services/cwr-touchup",
      "/services/property-management",
      "/team",
      "/resources",
      "/connections",
      "/about",
      "/contact",
    ];

    // Act
    const paths = getAllMenuLinks().map((link) => link.href);

    // Assert
    expect(paths).toEqual(expectedPaths);
  });
});

describe("home link", () => {
  it("leads the header menu", () => {
    // Arrange
    const expectedFirst = { kind: "link", label: "Home", href: "/" };

    // Act
    const first = MENU_SECTIONS[0];

    // Assert
    expect(first).toEqual(expectedFirst);
  });

  it("stays out of the footer, which links home through its logo", () => {
    // Arrange
    const homePath = "/";

    // Act
    const headings = getFooterColumns().filter((column) => column.links.some((link) => link.href === homePath));

    // Assert
    expect(headings).toEqual([]);
  });
});

describe("unlisted pages", () => {
  it("keeps link-only pages out of the menu and footer", () => {
    // Arrange
    const menuPaths = new Set(getAllMenuLinks().map((link) => link.href));

    // Act
    const listedUnlistedPaths = [...UNLISTED_PAGE_PATHS].filter((path) => menuPaths.has(path));

    // Assert
    expect(listedUnlistedPaths).toEqual([]);
  });

  it("keeps link-only pages out of the sitemap page list", () => {
    // Arrange
    const unlistedPaths = [...UNLISTED_PAGE_PATHS];

    // Act
    const sitemapPaths = unlistedPaths.filter((path) => STATIC_PAGE_PATHS.has(path));

    // Assert
    expect(sitemapPaths).toEqual([]);
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

describe("Connections page switch", () => {
  const HIDDEN = { isConnectionsPageVisible: false };
  const SHOWING = { isConnectionsPageVisible: true };

  it("keeps today's menu, footer, and page list while the page is showing", () => {
    // Arrange
    const expected = { menu: MENU_SECTIONS, footer: getFooterColumns(), links: getAllMenuLinks(), paths: [...STATIC_PAGE_PATHS] };

    // Act
    const actual = { menu: getMenuSections(SHOWING), footer: getFooterColumns(SHOWING), links: getAllMenuLinks(SHOWING), paths: getListedPagePaths(SHOWING) };

    // Assert
    expect(actual).toEqual(expected);
  });

  it("leaves Connections out of the menu, footer, link list, and page list while hidden", () => {
    // Arrange
    const connectionsPath = "/connections";

    // Act
    const hrefs = [
      ...getMenuSections(HIDDEN).flatMap((section) => (section.kind === "link" ? [section.href] : section.links.map((link) => link.href))),
      ...getFooterColumns(HIDDEN).flatMap((column) => column.links.map((link) => link.href)),
      ...getAllMenuLinks(HIDDEN).map((link) => link.href),
      ...getListedPagePaths(HIDDEN),
    ];

    // Assert
    expect(hrefs).not.toContain(connectionsPath);
  });

  it("keeps the Resources group with FAQs & Homework while Connections is hidden", () => {
    // Arrange
    const expectedResources = { kind: "group", label: "Resources", links: [{ label: "FAQs & Homework", href: "/resources" }] };

    // Act
    const resources = getMenuSections(HIDDEN).find((section) => section.label === "Resources");

    // Assert
    expect(resources).toEqual(expectedResources);
  });
});

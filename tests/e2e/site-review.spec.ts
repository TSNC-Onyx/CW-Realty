import { expect, test } from "@playwright/test";

import { VIEWPORTS } from "./pages";

// Owner-approved changes of 2026-09-26 (docs/cwr-site-review-round-plan.md).

const HEADER_HEIGHT_PX = 88;
const ASIDE_GAP_PX = 24;
const SHORT_SCROLL_PX = 200;

test.describe("menu", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
  });

  test("Home leads the header menu and is marked current on the home page", async ({ page }) => {
    // Arrange
    await page.goto("/");

    // Act
    const homeLink = page.locator("header nav").getByRole("link", { name: "Home" });

    // Assert
    await expect(homeLink).toHaveAttribute("aria-current", "page");
  });

  test("the Services menu lists Property management", async ({ page }) => {
    // Arrange
    await page.goto("/");

    // Act
    await page.getByRole("button", { name: "Services" }).click();

    // Assert
    await expect(page.locator("header").getByRole("link", { name: "Property management" })).toBeVisible();
  });

  test("the footer has no Home column", async ({ page }) => {
    // Arrange
    await page.goto("/");

    // Act
    const footerHeadings = await page.locator("footer nav h2").allTextContents();

    // Assert
    expect(footerHeadings).not.toContain("Home");
  });
});

test("/services is a page listing both services, not a redirect", async ({ page }) => {
  // Arrange
  const response = await page.goto("/services");

  // Act
  const cardHeadings = await page.getByRole("heading", { level: 3 }).allTextContents();

  // Assert
  expect(response?.request().redirectedFrom()).toBeNull();
  expect(cardHeadings).toEqual(["CWR TouchUp", "Property management"]);
});

test("the home hero slideshow can be paused and played", async ({ page }) => {
  // Arrange
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Pause slideshow" });

  // Act
  await toggle.click();

  // Assert
  await expect(page.getByRole("button", { name: "Play slideshow" })).toBeVisible();
});

test("the home hero stays still when the visitor prefers reduced motion", async ({ page }) => {
  // Arrange
  await page.emulateMedia({ reducedMotion: "reduce" });

  // Act
  await page.goto("/");

  // Assert
  await expect(page.getByRole("button", { name: "Play slideshow" })).toBeVisible();
});

test("on desktop the contact details float under the header while the form scrolls", async ({ page }) => {
  // Arrange
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/contact");
  const aside = page.getByRole("complementary", { name: "Reach us directly" });

  // Act
  await page.evaluate((distance) => window.scrollTo(0, distance), SHORT_SCROLL_PX);
  const box = await aside.boundingBox();

  // Assert
  expect(box?.y).toBe(HEADER_HEIGHT_PX + ASIDE_GAP_PX);
});

test("the floating contact details stop where the form ends, above the footer", async ({ page }) => {
  // Arrange
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/contact");

  // Act
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const [asideBox, footerBox] = await Promise.all([
    page.getByRole("complementary", { name: "Reach us directly" }).boundingBox(),
    page.locator("footer").boundingBox(),
  ]);

  // Assert
  expect((asideBox?.y ?? 0) + (asideBox?.height ?? 0)).toBeLessThan(footerBox?.y ?? 0);
});

test("CWR TouchUp shows what homeowners say before how it works", async ({ page }) => {
  // Arrange
  await page.goto("/services/cwr-touchup");

  // Act
  const headings = await page.getByRole("heading", { level: 2 }).allTextContents();

  // Assert
  expect(headings.slice(0, 2)).toEqual(["We call it a game changer. Here's what our customers say.", "Three steps to a better sale"]);
});

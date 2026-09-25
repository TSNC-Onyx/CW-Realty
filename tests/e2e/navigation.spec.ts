import { expect, test, type APIResponse } from "@playwright/test";

import { MISSING_PAGE_PATH, VIEWPORTS } from "./pages";

function getRedirect(response: APIResponse): { status: number; location: string } {
  const location = new URL(response.headers()["location"] ?? "", "http://placeholder");
  return { status: response.status(), location: location.pathname + location.search };
}

test.describe("keyboard and menus", () => {
  test("the skip link is the first thing keyboard users reach", async ({ page }) => {
    // Arrange
    await page.goto("/about");

    // Act
    await page.keyboard.press("Tab");

    // Assert
    await expect(page.locator(":focus")).toHaveText("Skip to main content");
  });

  test("the mobile menu closes on Escape and returns focus to the Menu button", async ({ page }) => {
    // Arrange
    await page.setViewportSize(VIEWPORTS.phone);
    await page.goto("/");
    const menuButton = page.getByRole("link", { name: "Menu" });
    await menuButton.click();
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();

    // Act
    await page.keyboard.press("Escape");

    // Assert
    await expect(menuButton).toBeFocused();
  });

  test("the mobile menu keeps focus inside while open", async ({ page }) => {
    // Arrange
    await page.setViewportSize(VIEWPORTS.phone);
    await page.goto("/");
    await page.getByRole("link", { name: "Menu" }).click();

    // Act
    for (let press = 0; press < 30; press += 1) await page.keyboard.press("Tab");

    // Assert
    const isFocusInsideDialog = await page.evaluate(() => document.querySelector("dialog")?.contains(document.activeElement));
    expect(isFocusInsideDialog).toBe(true);
  });

  test("a desktop sub-menu opens from the keyboard and closes on Escape", async ({ page }) => {
    // Arrange
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto("/");
    const listingsButton = page.getByRole("button", { name: "Listings" });
    await listingsButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("link", { name: "Property search" }).first()).toBeVisible();

    // Act
    await page.keyboard.press("Escape");

    // Assert
    await expect(listingsButton).toHaveAttribute("aria-expanded", "false");
  });

  test("the current page is marked for screen readers", async ({ page }) => {
    // Arrange
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto("/about");

    // Act
    await page.getByRole("button", { name: "About (current section)" }).click();

    // Assert
    await expect(page.locator('header a[aria-current="page"]:visible')).toHaveText("About us");
  });

  test("Call, Text, and Chat stay on screen on phones", async ({ page }) => {
    // Arrange
    await page.setViewportSize(VIEWPORTS.phone);
    await page.goto("/privacy-policy");

    // Act
    await page.mouse.wheel(0, 5000);

    // Assert
    const quickContact = page.getByRole("navigation", { name: "Quick contact" });
    await expect(quickContact.getByRole("link")).toHaveText(["Call", "Text", "Chat"]);
  });
});

test.describe("redirects and missing pages", () => {
  test("uppercase and trailing-slash URLs move to the clean URL in one permanent hop", async ({ request }) => {
    // Arrange
    const path = "/About/?utm_source=flyer";

    // Act
    const response = await request.get(path, { maxRedirects: 0 });

    // Assert
    expect(getRedirect(response)).toEqual({ status: 301, location: "/about?utm_source=flyer" });
  });

  test("/home goes to the home page", async ({ request }) => {
    // Arrange
    const path = "/Home/";

    // Act
    const response = await request.get(path, { maxRedirects: 0 });

    // Assert
    expect(getRedirect(response)).toEqual({ status: 301, location: "/" });
  });

  test("an unknown page answers 404 with a helpful page", async ({ page }) => {
    // Arrange
    const path = MISSING_PAGE_PATH;

    // Act
    const response = await page.goto(path);

    // Assert
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("We can't find that page");
  });
});

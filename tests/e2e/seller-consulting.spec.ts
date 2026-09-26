import { expect, test } from "@playwright/test";

import { VIEWPORTS } from "./pages";

// Link-only seller consulting page (docs/seller-consulting-page-plan.md): hidden from
// search engines, the sitemap, and the site menus; both plan buttons lead to the pricing form.

const PAGE_PATH = "/services/seller-consulting";

test.describe("seller consulting page", () => {
  test("asks search engines not to index it", async ({ page }) => {
    // Arrange
    await page.goto(PAGE_PATH);

    // Act
    const robots = page.locator('meta[name="robots"]');

    // Assert
    await expect(robots).toHaveAttribute("content", /noindex/);
  });

  test("is not listed in the sitemap", async ({ request }) => {
    // Arrange
    const response = await request.get("/sitemap.xml");

    // Act
    const sitemap = await response.text();

    // Assert
    expect(sitemap).not.toContain(PAGE_PATH);
  });

  test("is not linked from the header or footer", async ({ page }) => {
    // Arrange
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto("/");

    // Act
    const links = page.locator(`header a[href="${PAGE_PATH}"], footer a[href="${PAGE_PATH}"]`);

    // Assert
    await expect(links).toHaveCount(0);
  });

  test("has one page title", async ({ page }) => {
    // Arrange
    await page.goto(PAGE_PATH);

    // Act
    const titles = page.getByRole("heading", { level: 1 });

    // Assert
    await expect(titles).toHaveText(["Seller consulting"]);
  });

  test("marks Well advised as the best value", async ({ page }) => {
    // Arrange
    await page.goto(PAGE_PATH);

    // Act
    const plan = page.getByRole("article", { name: "Well advised" });

    // Assert
    await expect(plan).toContainText("Best Value");
  });

  for (const planName of ["Choice services", "Well advised"]) {
    test(`the ${planName} button leads to the pricing form`, async ({ page }) => {
      // Arrange
      await page.setViewportSize(VIEWPORTS.phone);
      await page.goto(PAGE_PATH);

      // Act
      await page.getByRole("article", { name: planName }).getByRole("link", { name: "Ask for pricing" }).click();

      // Assert
      await expect(page.getByRole("heading", { name: "Ask for pricing" })).toBeInViewport();
    });
  }
});

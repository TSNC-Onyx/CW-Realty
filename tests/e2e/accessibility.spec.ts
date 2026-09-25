import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { MISSING_PAGE_PATH, PUBLIC_PAGE_PATHS, VIEWPORTS } from "./pages";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

for (const path of [...PUBLIC_PAGE_PATHS, MISSING_PAGE_PATH]) {
  for (const [viewportName, viewport] of Object.entries({ phone: VIEWPORTS.phone, desktop: VIEWPORTS.desktop })) {
    test(`${path} has no WCAG 2.2 AA violations on ${viewportName}`, async ({ page }) => {
      // Arrange
      await page.setViewportSize(viewport);
      await page.goto(path);

      // Act
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

      // Assert
      expect(results.violations).toEqual([]);
    });
  }

  test(`${path} has exactly one H1`, async ({ page }) => {
    // Arrange
    await page.goto(path);

    // Act
    const headingCount = await page.locator("h1").count();

    // Assert
    expect(headingCount).toBe(1);
  });
}

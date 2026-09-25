import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test("home page has no WCAG 2.2 AA violations", async ({ page }) => {
  // Arrange
  await page.goto("/");

  // Act
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

  // Assert
  expect(results.violations).toEqual([]);
});

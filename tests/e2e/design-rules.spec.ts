import { expect, test } from "@playwright/test";

import { getCornerViolations, getGoldOnLightViolations, getSmallTextViolations, getTapTargetViolations } from "./design-checks";
import { CONTENT_PAGE_PATHS, PUBLIC_PAGE_PATHS, VIEWPORTS } from "./pages";

// Style §11.15 checks on every public page, plus no sideways scrolling at 320px (Style §3).

for (const path of [...PUBLIC_PAGE_PATHS, ...CONTENT_PAGE_PATHS]) {
  for (const [viewportName, viewport] of Object.entries({ phone: VIEWPORTS.phone, desktop: VIEWPORTS.desktop })) {
    test.describe(`${path} on ${viewportName}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(path);
      });

      test("every tap target is at least 44px", async ({ page }) => {
        // Arrange
        const expectedViolations: string[] = [];

        // Act
        const violations = await getTapTargetViolations(page);

        // Assert
        expect(violations).toEqual(expectedViolations);
      });

      test("gold appears only on dark surfaces", async ({ page }) => {
        // Arrange
        const expectedViolations: string[] = [];

        // Act
        const violations = await getGoldOnLightViolations(page);

        // Assert
        expect(violations).toEqual(expectedViolations);
      });

      test("corners are square except circles", async ({ page }) => {
        // Arrange
        const expectedViolations: string[] = [];

        // Act
        const violations = await getCornerViolations(page);

        // Assert
        expect(violations).toEqual(expectedViolations);
      });

      test("no text is smaller than 14px", async ({ page }) => {
        // Arrange
        const expectedViolations: string[] = [];

        // Act
        const violations = await getSmallTextViolations(page);

        // Assert
        expect(violations).toEqual(expectedViolations);
      });
    });
  }

  test(`${path} never scrolls sideways at 320px`, async ({ page }) => {
    // Arrange
    await page.setViewportSize(VIEWPORTS.smallPhone);
    await page.goto(path);

    // Act
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    // Assert
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

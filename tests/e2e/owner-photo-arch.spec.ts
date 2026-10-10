import { expect, test } from "@playwright/test";

import { VIEWPORTS } from "./pages";

// Charlie's portrait has an arched top on About and Selected services (owner choice 2026-10-09,
// docs/cwr-owner-photo-arch-plan.md); every other photo stays square.

const ARCH_PAGE_PATHS = ["/about", "/services/selected-services"];
const SQUARE_PAGE_PATH = "/team/charlie-ward";

for (const path of ARCH_PAGE_PATHS) {
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    test(`${path} portrait has an arched top at ${viewportName}`, async ({ page }) => {
      // Arrange
      await page.setViewportSize(viewport);
      await page.goto(path);

      // Act
      const portrait = page.locator("main .photo-arch");
      await expect(portrait).toHaveCount(1);
      const corners = await portrait.evaluate((element) => {
        const style = getComputedStyle(element);
        return { width: element.getBoundingClientRect().width, topLeft: style.borderTopLeftRadius, bottomLeft: style.borderBottomLeftRadius };
      });

      // Assert
      expect(parseFloat(corners.topLeft)).toBeGreaterThanOrEqual(corners.width / 2);
      expect(corners.bottomLeft).toBe("0px");
    });
  }
}

test("the team page portrait stays square", async ({ page }) => {
  // Arrange
  await page.goto(SQUARE_PAGE_PATH);

  // Act
  const archedPhotos = page.locator(".photo-arch");

  // Assert
  await expect(archedPhotos).toHaveCount(0);
});

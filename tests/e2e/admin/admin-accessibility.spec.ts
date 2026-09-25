import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { getCornerViolations, getGoldOnLightViolations, getSmallTextViolations, getTapTargetViolations } from "../design-checks";
import { VIEWPORTS } from "../pages";
import { HAS_ADMIN_DATABASE, createTestAdmin, signInFully } from "./admin-helpers";

// Admin §1 "works fully on mobile" + WCAG 2.2 AA + Style §11.15 on every admin screen.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const SIGNED_IN_PATHS = ["/admin", "/admin/listings", "/admin/listings/new", "/admin/team", "/admin/team/new", "/admin/contact", "/admin/trash", "/admin/users"];
const SIGNED_OUT_PATHS = ["/admin/login", "/admin/forgot-password"];

test.skip(!HAS_ADMIN_DATABASE, "Needs the local database and service-role key");

async function getPageProblems(page: Page): Promise<string[]> {
  const axe = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  return [
    ...axe.violations.map((violation) => `axe: ${violation.id} (${violation.nodes.length})`),
    ...(await getTapTargetViolations(page)),
    ...(await getGoldOnLightViolations(page)),
    ...(await getCornerViolations(page)),
    ...(await getSmallTextViolations(page)),
    ...(overflow > 0 ? [`scrolls sideways by ${overflow}px`] : []),
  ];
}

for (const [viewportName, viewport] of Object.entries({ phone: VIEWPORTS.phone, desktop: VIEWPORTS.desktop })) {
  test(`signed-in admin screens pass accessibility and design checks on ${viewportName}`, async ({ page }) => {
    // Arrange
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await signInFully(page, await createTestAdmin("owner"));
    const problemsByPath: Record<string, string[]> = {};

    // Act
    for (const path of SIGNED_IN_PATHS) {
      await page.goto(path);
      problemsByPath[path] = await getPageProblems(page);
    }

    // Assert
    expect(Object.entries(problemsByPath).filter(([, problems]) => problems.length > 0)).toEqual([]);
  });

  test(`sign-in screens pass accessibility and design checks on ${viewportName}`, async ({ page }) => {
    // Arrange
    await page.setViewportSize(viewport);
    const problemsByPath: Record<string, string[]> = {};

    // Act
    for (const path of SIGNED_OUT_PATHS) {
      await page.goto(path);
      problemsByPath[path] = await getPageProblems(page);
    }

    // Assert
    expect(Object.entries(problemsByPath).filter(([, problems]) => problems.length > 0)).toEqual([]);
  });
}

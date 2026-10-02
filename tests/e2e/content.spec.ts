import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIResponse } from "@playwright/test";

import { VIEWPORTS } from "./pages";

// Listing and team pages with real records. These need the local database with the
// live-site content imported (npm run content:import:local); CI runs without one.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const LISTING_PATH = "/listings/5423-pine-level-dr-browns-summit-nc";
// Coming Soon in the test content (tests/fixtures/test-content.json).
const COMING_SOON_LISTING_PATH = "/listings/3826-burlington-rd-greensboro-nc";
const MEMBER_PATH = "/team/charlie-ward";

test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "Needs a database with imported content");

function getLocation(response: APIResponse): { status: number; location: string } {
  const location = new URL(response.headers()["location"] ?? "", "http://placeholder");
  return { status: response.status(), location: location.pathname };
}

for (const path of [LISTING_PATH, MEMBER_PATH]) {
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
}

test("a listing page shows the address, price, and every photo with alt text", async ({ page }) => {
  // Arrange
  await page.goto(LISTING_PATH);

  // Act
  const altTexts = await page.locator("main img").evaluateAll((images) => images.map((image) => image.getAttribute("alt") ?? ""));

  // Assert
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("5423 Pine Level Dr");
  await expect(page.getByText("$225,000")).toBeVisible();
  expect(altTexts.length > 0 && altTexts.every((alt) => alt.trim().length > 0)).toBe(true);
});

test("the listings page shows sold homes with a Sold label", async ({ page }) => {
  // Arrange
  await page.goto("/listings");

  // Act
  const soldCard = page.getByRole("link", { name: /912 Rocky Meadows Ln/ });

  // Assert
  await expect(soldCard).toContainText("Sold");
});

test("the listings page shows statuses in the owner's order", async ({ page }) => {
  // Arrange: other tests may publish more listings while this runs
  const statusOrder = ["Coming Soon", "For Sale", "Under Contract", "Sold"];
  await page.goto("/listings");

  // Act
  const tagTexts = await page.locator("main .type-tag").allTextContents();
  const ranks = tagTexts.map((text) => statusOrder.indexOf(text));

  // Assert
  expect(ranks).toEqual([...ranks].sort((first, second) => first - second));
});

test("a Coming Soon listing asks visitors to hear when it can be shown", async ({ page }) => {
  // Arrange
  await page.goto(COMING_SOON_LISTING_PATH);

  // Act
  const panelHeading = page.getByRole("heading", { level: 2, name: "Coming soon" });

  // Assert
  await expect(panelHeading).toBeVisible();
});

test("an old Wix listing link moves permanently to the new page", async ({ request }) => {
  // Arrange
  const oldPath = "/5423pineleveldr";

  // Act
  const response = await request.get(oldPath, { maxRedirects: 0 });

  // Assert
  expect(getLocation(response)).toEqual({ status: 301, location: LISTING_PATH });
});

test("an old link to a hidden team member reaches /team in one temporary hop", async ({ request }) => {
  // Arrange
  const oldPath = "/russell-casey";

  // Act
  const response = await request.get(oldPath, { maxRedirects: 0 });

  // Assert
  expect(getLocation(response)).toEqual({ status: 302, location: "/team" });
});

test("a page number past the end answers 404", async ({ request }) => {
  // Arrange
  const path = "/listings?page=50";

  // Act
  const response = await request.get(path);

  // Assert
  expect(response.status()).toBe(404);
});

test("the sitemap lists live listings and visible members but not hidden ones", async ({ request }) => {
  // Arrange
  const path = "/sitemap.xml";

  // Act
  const sitemap = await (await request.get(path)).text();

  // Assert
  expect([sitemap.includes(LISTING_PATH), sitemap.includes(MEMBER_PATH), sitemap.includes("russell-casey")]).toEqual([true, true, false]);
});

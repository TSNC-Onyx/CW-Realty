import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import { HAS_ADMIN_DATABASE, createTestAdmin, signInFully } from "../admin/admin-helpers";
import { getCornerViolations, getGoldOnLightViolations, getSmallTextViolations, getTapTargetViolations } from "../design-checks";
import { VIEWPORTS } from "../pages";

// Owner switch for the Connections page (docs/cwr-connections-page-switch-plan.md). Hiding it
// changes every page's menu, so these tests run one at a time after every other test.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const HIDE_BUTTON = "Hide the Connections page from the website";
const SHOW_BUTTON = "Show the Connections page on the website";

test.skip(!HAS_ADMIN_DATABASE, "Needs the local database and service-role key");
test.describe.configure({ mode: "serial" });

async function setConnectionsPageVisible(isVisible: boolean): Promise<void> {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", { db: { schema: "cwr" }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: tenant } = await client.from("tenants").select("id").eq("slug", "cwr").single();
  const { error } = await client.from("site_settings").update({ is_connections_page_visible: isVisible }).eq("tenant_id", tenant?.id);
  if (error) throw new Error(`Could not change the Connections page switch: ${error.message}`);
}

async function fetchListedPaths(page: Page): Promise<string[]> {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/about");
  const footerLinks = await page.locator("footer nav a").evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  const sitemap = await (await page.request.get("/sitemap.xml")).text();
  const sitemapPaths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1] ?? "").pathname);
  return [...footerLinks, ...sitemapPaths];
}

test.beforeAll(async () => {
  await setConnectionsPageVisible(true);
});

test.afterAll(async () => {
  await setConnectionsPageVisible(true);
});

test("an owner hides the Connections page and every listing of it goes away", async ({ page }) => {
  // Arrange
  await signInFully(page, await createTestAdmin("owner"));
  await page.goto("/admin/connections");

  // Act
  await page.getByRole("button", { name: HIDE_BUTTON }).click();
  await expect(page.getByRole("status").filter({ hasText: "The Connections page is hidden" })).toBeVisible();

  // Assert
  await expect(page.getByText("The Connections page is hidden from the website.")).toBeVisible();
  expect(await fetchListedPaths(page)).not.toContain("/connections");
  await page.goto("/resources");
  await page.locator("header").getByRole("button", { name: "Resources" }).click();
  await expect(page.locator("header").getByRole("link", { name: "Connections" })).toHaveCount(0);
});

test("the hidden page's address sends visitors to Resources for now", async ({ request }) => {
  // Arrange
  const hiddenPath = "/connections";

  // Act
  const response = await request.get(hiddenPath, { maxRedirects: 0 });

  // Assert
  expect({ status: response.status(), location: response.headers().location }).toEqual({ status: 307, location: "/resources" });
});

test("Undo and Show bring the page back everywhere", async ({ page }) => {
  // Arrange
  await setConnectionsPageVisible(false);
  await signInFully(page, await createTestAdmin("owner"));
  await page.goto("/admin/connections");

  // Act
  await page.getByRole("button", { name: SHOW_BUTTON }).click();
  await expect(page.getByRole("status").filter({ hasText: "showing on the website again" })).toBeVisible();
  await page.getByRole("button", { name: HIDE_BUTTON }).click();
  // The earlier "showing again" message has its own Undo, so use the one beside "hidden".
  await page.getByRole("status").filter({ hasText: "The Connections page is hidden" }).getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: HIDE_BUTTON })).toBeVisible();

  // Assert
  expect(await fetchListedPaths(page)).toContain("/connections");
  expect((await page.request.get("/connections", { maxRedirects: 0 })).status()).toBe(200);
});

test("a manager sees whether the page is showing but can't switch it", async ({ page }) => {
  // Arrange
  await signInFully(page, await createTestAdmin("manager"));

  // Act
  await page.goto("/admin/connections");

  // Assert
  await expect(page.getByText("Showing on the website, in the menu under Resources.")).toBeVisible();
  await expect(page.getByText("Only owners can show or hide the page.")).toBeVisible();
  await expect(page.getByRole("button", { name: HIDE_BUTTON })).toHaveCount(0);
});

for (const isVisible of [true, false]) {
  test(`Admin → Connections passes accessibility and design checks while the page is ${isVisible ? "showing" : "hidden"}`, async ({ page }) => {
    // Arrange
    await setConnectionsPageVisible(isVisible);
    await signInFully(page, await createTestAdmin("owner"));
    await page.goto("/admin/connections");

    // Act
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    const designViolations = [...(await getTapTargetViolations(page)), ...(await getGoldOnLightViolations(page)), ...(await getCornerViolations(page)), ...(await getSmallTextViolations(page))];

    // Assert
    expect({ axe: results.violations, design: designViolations }).toEqual({ axe: [], design: [] });
    await setConnectionsPageVisible(true);
  });
}

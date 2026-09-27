import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { HAS_ADMIN_DATABASE, createTestAdmin, signInFully } from "./admin-helpers";

// Admin → Homework end to end (owner approval 2026-09-27): add a guide and upload its file,
// add a link, add a video with captions, refuse the wrong file type, and pass WCAG 2.2 AA.

const FIXTURES = path.join(__dirname, "..", "..", "fixtures");
const TEST_GUIDE = path.join(FIXTURES, "test-guide.pdf");
const TEST_CAPTIONS = path.join(FIXTURES, "test-captions.vtt");
const NOT_A_GUIDE = path.join(FIXTURES, "not-a-guide.txt");
const TEST_VIDEO = path.join(__dirname, "..", "..", "..", "public", "video", "cwr-touchup.mp4");
const UPLOAD_TIMEOUT_MS = 90_000;
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.skip(!HAS_ADMIN_DATABASE, "Needs the local database and service-role key");

async function addDownload(page: Page, { title, group }: { title: string; group: string }): Promise<void> {
  await page.goto("/admin/homework/new-download");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Group").selectOption({ label: group });
  await page.getByRole("button", { name: "Add download or link" }).click();
  await expect(page.getByText("Item added")).toBeVisible();
}

test("a manager adds a guide, uploads its file, and visitors can download it", async ({ page }) => {
  // Arrange
  test.setTimeout(UPLOAD_TIMEOUT_MS);
  await signInFully(page, await createTestAdmin("manager"));
  const title = `Test guide ${Date.now()}`;
  await addDownload(page, { title, group: "For sellers" });

  // Act
  await page.getByLabel("Choose a file").setInputFiles(TEST_GUIDE);
  await page.getByRole("button", { name: "Upload file" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Uploaded and shown on the Homework page." })).toBeVisible({ timeout: UPLOAD_TIMEOUT_MS });

  // Assert
  await page.goto("/resources");
  const row = page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 4, name: title }) });
  await expect(row.getByText("PDF · 1 KB")).toBeVisible();
  const href = await row.getByRole("link", { name: new RegExp(`^Download PDF\\W+${title}$`) }).getAttribute("href");
  expect((await page.request.get(href ?? "")).status()).toBe(200);
});

test("the wrong file type is explained beside the upload field", async ({ page }) => {
  // Arrange
  await signInFully(page, await createTestAdmin("manager"));
  await addDownload(page, { title: `Wrong type ${Date.now()}`, group: "For buyers" });

  // Act
  await page.getByLabel("Choose a file").setInputFiles(NOT_A_GUIDE);
  await page.getByRole("button", { name: "Upload file" }).click();

  // Assert
  await expect(page.getByText("This file type isn't accepted here. Accepted: PDF, PowerPoint, Word, Excel.")).toBeVisible();
});

test("an owner adds a link to another website and it shows on the page", async ({ page }) => {
  // Arrange
  await signInFully(page, await createTestAdmin("owner"));
  const title = `Test link ${Date.now()}`;
  await page.goto("/admin/homework/new-download");

  // Act
  await page.getByLabel("A link to another website").check();
  await page.getByLabel("Web address").fill("https://www.ncrec.gov/Brochures/Print/WWREAPrint.pdf");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Group").selectOption({ label: "Required reading in North Carolina" });
  await page.getByRole("button", { name: "Add download or link" }).click();
  await expect(page.getByText("Item added")).toBeVisible();

  // Assert
  await page.goto("/resources");
  await expect(page.getByRole("link", { name: new RegExp(`^Download PDF\\W+${title}$`) })).toHaveAttribute("href", "https://www.ncrec.gov/Brochures/Print/WWREAPrint.pdf");
});

test("a video shows once uploaded, and captions clear the warning", async ({ page }) => {
  // Arrange
  test.setTimeout(UPLOAD_TIMEOUT_MS * 2);
  await signInFully(page, await createTestAdmin("manager"));
  const title = `Test video ${Date.now()}`;
  await page.goto("/admin/homework/new-video");
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Add video" }).click();
  await expect(page.getByText("Video added")).toBeVisible();
  await page.getByLabel("Choose a video").setInputFiles(TEST_VIDEO);
  await page.getByRole("button", { name: "Upload video" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Uploaded and shown on the Homework page." })).toBeVisible({ timeout: UPLOAD_TIMEOUT_MS });
  await page.goto("/admin/homework");
  const listRow = page.getByRole("listitem").filter({ hasText: title });
  await expect(listRow.getByText("No captions yet")).toBeVisible();

  // Act
  await listRow.getByRole("link", { name: `Edit ${title}` }).click();
  await page.getByLabel("Choose a captions file").setInputFiles(TEST_CAPTIONS);
  await page.getByRole("button", { name: "Add captions" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Captions saved." })).toBeVisible({ timeout: UPLOAD_TIMEOUT_MS });

  // Assert
  await page.goto("/admin/homework");
  await expect(page.getByRole("listitem").filter({ hasText: title }).getByText("No captions yet")).toHaveCount(0);
});

test("an item's edit screen passes WCAG 2.2 AA", async ({ page }) => {
  // Arrange
  await signInFully(page, await createTestAdmin("owner"));
  await addDownload(page, { title: `Accessible guide ${Date.now()}`, group: "For buyers" });

  // Act
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

  // Assert
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
});

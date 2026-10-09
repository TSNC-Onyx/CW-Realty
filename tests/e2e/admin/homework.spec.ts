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
// Automatic-cover clips (tests/fixtures/generate-cover-videos.mjs) and a file no browser can read.
const COVER_NORMAL_VIDEO = path.join(FIXTURES, "cover-normal.mp4");
const COVER_BLACK_START_VIDEO = path.join(FIXTURES, "cover-black-start.mp4");
const UNREADABLE_VIDEO = path.join(FIXTURES, "cover-unreadable.mp4");
const TEST_PHOTO = path.join(FIXTURES, "test-house.jpg");
const COVER_MADE_TEXT = "Cover picture made from the video's opening scene";
const AUTO_COVER_NOTE = "Made from the video's opening scene";
const UPLOAD_TIMEOUT_MS = 90_000;
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.skip(!HAS_ADMIN_DATABASE, "Needs the local database and service-role key");

async function addVideo(page: Page, title: string): Promise<void> {
  await page.goto("/admin/homework/new-video");
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Add video" }).click();
  await expect(page.getByText("Video added")).toBeVisible();
}

async function uploadVideo(page: Page, video: string): Promise<void> {
  await page.getByLabel(/Choose (a|a new) video/).setInputFiles(video);
  await page.getByRole("button", { name: /^(Upload video|Replace video)$/ }).click();
  await expect(page.getByRole("status").filter({ hasText: /Uploaded and shown on the Homework page\.|File replaced\./ })).toBeVisible({ timeout: UPLOAD_TIMEOUT_MS });
}

function getCoverImage(page: Page) {
  return page.getByRole("region", { name: /Cover picture/ }).getByRole("img");
}

/** Share of the cover's pixels that are near black, measured from the saved picture itself. */
async function getCoverDarkShare(page: Page): Promise<number> {
  const source = await getCoverImage(page).evaluate((image: HTMLImageElement) => image.currentSrc);
  return page.evaluate(async (url) => {
    const picture = new Image();
    picture.crossOrigin = "anonymous";
    picture.src = url;
    await picture.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 18;
    const context = canvas.getContext("2d");
    context?.drawImage(picture, 0, 0, 32, 18);
    const pixels = context?.getImageData(0, 0, 32, 18).data ?? new Uint8ClampedArray();
    let darkCount = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (0.2126 * (pixels[offset] ?? 0) + 0.7152 * (pixels[offset + 1] ?? 0) + 0.0722 * (pixels[offset + 2] ?? 0) < 26) darkCount += 1;
    }
    return darkCount / (pixels.length / 4);
  }, source);
}

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

test("a video without a cover gets one from its opening scene", async ({ page }) => {
  // Arrange
  test.setTimeout(UPLOAD_TIMEOUT_MS * 2);
  await signInFully(page, await createTestAdmin("manager"));
  await addVideo(page, `Cover video ${Date.now()}`);

  // Act
  await uploadVideo(page, COVER_NORMAL_VIDEO);

  // Assert
  await expect(page.getByRole("status").filter({ hasText: COVER_MADE_TEXT })).toBeVisible({ timeout: UPLOAD_TIMEOUT_MS });
  await page.reload();
  await expect(page.getByText(AUTO_COVER_NOTE, { exact: true })).toBeVisible();
});

test("a video that starts on a black screen gets its cover from one second in", async ({ page }) => {
  // Arrange
  test.setTimeout(UPLOAD_TIMEOUT_MS * 2);
  await signInFully(page, await createTestAdmin("manager"));
  await addVideo(page, `Black start video ${Date.now()}`);

  // Act
  await uploadVideo(page, COVER_BLACK_START_VIDEO);

  // Assert: a cover was made, and it is the picture from 1 second in, not the black opening
  await expect(page.getByRole("status").filter({ hasText: COVER_MADE_TEXT })).toBeVisible({ timeout: UPLOAD_TIMEOUT_MS });
  await page.reload();
  expect(await getCoverDarkShare(page)).toBeLessThan(0.5);
});

test("a video the browser can't read still uploads, and the admin is asked to add a cover", async ({ page }) => {
  // Arrange
  test.setTimeout(UPLOAD_TIMEOUT_MS * 2);
  await signInFully(page, await createTestAdmin("manager"));
  await addVideo(page, `Unreadable video ${Date.now()}`);

  // Act
  await uploadVideo(page, UNREADABLE_VIDEO);

  // Assert
  await expect(page.getByRole("status").filter({ hasText: "couldn't read the video to make a cover picture" })).toBeVisible({ timeout: UPLOAD_TIMEOUT_MS });
});

test("a cover the admin uploaded is never replaced by a video upload", async ({ page }) => {
  // Arrange
  test.setTimeout(UPLOAD_TIMEOUT_MS * 2);
  await signInFully(page, await createTestAdmin("manager"));
  await addVideo(page, `Own cover video ${Date.now()}`);
  await page.getByLabel("Choose a photo").setInputFiles(TEST_PHOTO);
  await page.getByLabel("Describe the photo").fill("Title card for the test video");
  await page.getByRole("button", { name: "Add cover picture" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Cover picture saved." })).toBeVisible({ timeout: UPLOAD_TIMEOUT_MS });

  // Act
  await uploadVideo(page, COVER_NORMAL_VIDEO);

  // Assert
  await page.reload();
  await expect(page.getByRole("img", { name: "Title card for the test video" })).toBeVisible();
  await expect(page.getByText(AUTO_COVER_NOTE, { exact: true })).toHaveCount(0);
});

test("a cover uploaded in another tab while the video uploads is kept", async ({ page, context }) => {
  // Arrange: this tab still thinks the item has no cover
  test.setTimeout(UPLOAD_TIMEOUT_MS * 2);
  await signInFully(page, await createTestAdmin("manager"));
  await addVideo(page, `Two tabs video ${Date.now()}`);
  const otherTab = await context.newPage();
  await otherTab.goto(page.url());
  await otherTab.getByLabel("Choose a photo").setInputFiles(TEST_PHOTO);
  await otherTab.getByLabel("Describe the photo").fill("Cover chosen in the other tab");
  await otherTab.getByRole("button", { name: "Add cover picture" }).click();
  await expect(otherTab.getByRole("status").filter({ hasText: "Cover picture saved." })).toBeVisible({ timeout: UPLOAD_TIMEOUT_MS });

  // Act
  await uploadVideo(page, COVER_NORMAL_VIDEO);

  // Assert
  await expect(page.getByRole("status").filter({ hasText: "Your own cover picture was kept." })).toBeVisible({ timeout: UPLOAD_TIMEOUT_MS });
  await page.reload();
  await expect(page.getByRole("img", { name: "Cover chosen in the other tab" })).toBeVisible();
});

test("replacing the video refreshes an automatic cover", async ({ page }) => {
  // Arrange
  test.setTimeout(UPLOAD_TIMEOUT_MS * 3);
  await signInFully(page, await createTestAdmin("manager"));
  await addVideo(page, `Replace video ${Date.now()}`);
  await uploadVideo(page, COVER_NORMAL_VIDEO);
  await expect(page.getByRole("status").filter({ hasText: COVER_MADE_TEXT })).toBeVisible({ timeout: UPLOAD_TIMEOUT_MS });
  await page.reload();
  const firstCover = await getCoverImage(page).getAttribute("src");

  // Act
  await uploadVideo(page, COVER_BLACK_START_VIDEO);

  // Assert
  await expect(page.getByRole("status").filter({ hasText: COVER_MADE_TEXT })).toBeVisible({ timeout: UPLOAD_TIMEOUT_MS });
  await page.reload();
  await expect(page.getByText(AUTO_COVER_NOTE, { exact: true })).toBeVisible();
  expect(await getCoverImage(page).getAttribute("src")).not.toBe(firstCover);
});

async function addVideoWithAutomaticCover(page: Page, title: string): Promise<void> {
  await signInFully(page, await createTestAdmin("manager"));
  await addVideo(page, title);
  await uploadVideo(page, COVER_NORMAL_VIDEO);
  await expect(page.getByRole("status").filter({ hasText: COVER_MADE_TEXT })).toBeVisible({ timeout: UPLOAD_TIMEOUT_MS });
  await page.reload();
}

test("undoing the removal of an automatic cover brings it back as automatic", async ({ page }) => {
  // Arrange
  test.setTimeout(UPLOAD_TIMEOUT_MS * 2);
  await addVideoWithAutomaticCover(page, `Undo cover video ${Date.now()}`);

  // Act
  await page.getByRole("button", { name: /Remove the cover picture of/ }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: COVER_MADE_TEXT })).toBeVisible();

  // Assert
  await page.reload();
  await expect(page.getByText(AUTO_COVER_NOTE, { exact: true })).toBeVisible();
});

test("an edit screen with an automatic cover passes WCAG 2.2 AA", async ({ page }) => {
  // Arrange
  test.setTimeout(UPLOAD_TIMEOUT_MS * 2);
  await addVideoWithAutomaticCover(page, `Accessible cover video ${Date.now()}`);

  // Act
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

  // Assert
  expect(results.violations).toEqual([]);
});

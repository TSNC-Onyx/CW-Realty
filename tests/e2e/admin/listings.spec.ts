import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { HAS_ADMIN_DATABASE, createTestAdmin, signInFully } from "./admin-helpers";

// Listings editor (Admin §2): draft → photo → preview → publish → status → trash, and photos
// added with the listing in the order chosen (docs/admin-upload-layout-plan.md).

const TEST_PHOTO = path.join(__dirname, "..", "..", "fixtures", "test-house.jpg");
const PHOTO_TIMEOUT_MS = 90_000;

test.skip(!HAS_ADMIN_DATABASE, "Needs the local database and service-role key");

async function createDraftListing(page: Page, streetAddress: string): Promise<void> {
  await page.goto("/admin/listings/new");
  await page.getByLabel("Street address").fill(streetAddress);
  await page.getByLabel("City").fill("Greensboro");
  await page.getByLabel("ZIP code").fill("27401");
  await page.getByLabel("Price").fill("310,000");
  await page.getByLabel("Bedrooms (optional)").fill("3");
  await page.getByLabel("Bathrooms (optional)").fill("2.5");
  await page.getByLabel("About this property").fill("A test home with a big yard.");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByText("Listing saved as a draft")).toBeVisible();
}

test("a listing can't be published without a photo, then goes live with one", async ({ page }) => {
  // Arrange
  test.setTimeout(PHOTO_TIMEOUT_MS + 60_000);
  const admin = await createTestAdmin("manager");
  const streetAddress = `${Date.now() % 100000} Test Ln`;
  await signInFully(page, admin);
  await createDraftListing(page, streetAddress);
  await expect(page.getByRole("button", { name: "Publish this listing to the website" })).toBeDisabled();

  // Act
  await page.getByLabel("Choose photos").setInputFiles(TEST_PHOTO);
  await page.getByLabel("Describe the main photo").fill("Front of the test home");
  await page.getByRole("button", { name: "Upload 1 photo" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Photo added." })).toBeVisible({ timeout: PHOTO_TIMEOUT_MS });
  await page.getByRole("button", { name: "Publish this listing to the website" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();

  // Assert
  const slug = `${streetAddress} greensboro nc`.toLowerCase().replace(/ /g, "-");
  await page.goto(`/listings/${slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(streetAddress);
  await expect(page.getByRole("img", { name: "Front of the test home" })).toBeVisible();
});

test("the preview shows a draft before it is public", async ({ page }) => {
  // Arrange
  const admin = await createTestAdmin("owner");
  const streetAddress = `${Date.now() % 100000} Preview Ct`;
  await signInFully(page, admin);
  await createDraftListing(page, streetAddress);

  // Act
  await page.getByRole("link", { name: "Preview" }).click();

  // Assert
  await expect(page.getByText("Preview — visitors can't see this draft yet")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: streetAddress })).toBeVisible();
});

test("a new listing starts as Coming Soon and can be marked for sale", async ({ page }) => {
  // Arrange
  const admin = await createTestAdmin("manager");
  const streetAddress = `${Date.now() % 100000} Status Way`;
  await signInFully(page, admin);
  await createDraftListing(page, streetAddress);
  await expect(page.getByText("Status: Coming Soon")).toBeVisible();

  // Act
  await page.getByRole("button", { name: "Mark this listing as for sale" }).click();

  // Assert
  await expect(page.getByRole("status").filter({ hasText: "Marked as for sale." })).toBeVisible();
});

test("a bad price is explained beside the field and nothing typed is lost", async ({ page }) => {
  // Arrange
  const admin = await createTestAdmin("manager");
  await signInFully(page, admin);
  await page.goto("/admin/listings/new");
  await page.getByLabel("Street address").fill("1 Keep St");

  // Act
  await page.getByLabel("Price").fill("lots");
  await page.getByRole("button", { name: "Save as draft" }).click();

  // Assert
  await expect(page.getByText("Enter the price in dollars, like 225,000")).toBeVisible();
  await expect(page.getByLabel("Street address")).toHaveValue("1 Keep St");
});

test("moving a listing to trash can be undone", async ({ page }) => {
  // Arrange
  const admin = await createTestAdmin("manager");
  const streetAddress = `${Date.now() % 100000} Undo Rd`;
  await signInFully(page, admin);
  await createDraftListing(page, streetAddress);
  await page.goto("/admin/listings");

  // Act
  await page.getByRole("button", { name: `Move ${streetAddress} to trash` }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();

  // Assert
  await expect(page.getByRole("button", { name: `Move ${streetAddress} to trash` })).toBeVisible();
});

test("photos chosen on Add listing upload with it, in the order chosen, and can be reordered", async ({ page }) => {
  // Arrange
  test.setTimeout(PHOTO_TIMEOUT_MS * 2 + 60_000);
  const admin = await createTestAdmin("manager");
  await signInFully(page, admin);
  await page.goto("/admin/listings/new");
  await page.getByLabel("Street address").fill(`${Date.now() % 100000} Photo Path`);
  await page.getByLabel("City").fill("Greensboro");
  await page.getByLabel("ZIP code").fill("27401");
  await page.getByLabel("Price").fill("299,000");
  await page.getByLabel("About this property").fill("A test home with two photos.");
  await page.getByLabel("Choose photos").setInputFiles([TEST_PHOTO, TEST_PHOTO]);
  await page.getByLabel("Describe the main photo").fill("Front of the test home");
  await page.getByLabel("Describe the photo 2").fill("Back yard of the test home");

  // Act
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByText("Listing saved as a draft")).toBeVisible({ timeout: PHOTO_TIMEOUT_MS * 2 });
  await page.getByRole("button", { name: "Move photo 2 earlier" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Moved up." })).toBeVisible();

  // Assert
  await expect(page.getByLabel("Describe the main photo")).toHaveValue("Back yard of the test home");
  await expect(page.getByLabel("Describe the photo 2")).toHaveValue("Front of the test home");
});

test("dragging a listing photo onto another moves it there", async ({ page }) => {
  // Arrange
  test.setTimeout(PHOTO_TIMEOUT_MS * 2 + 60_000);
  const admin = await createTestAdmin("manager");
  await signInFully(page, admin);
  await createDraftListing(page, `${Date.now() % 100000} Drag Ct`);
  await page.getByLabel("Choose photos").setInputFiles([TEST_PHOTO, TEST_PHOTO, TEST_PHOTO]);
  await page.getByLabel("Describe the main photo").fill("First photo");
  await page.getByLabel("Describe the new photo 2").fill("Second photo");
  await page.getByLabel("Describe the new photo 3").fill("Third photo");
  await page.getByRole("button", { name: "Upload 3 photos" }).click();
  await expect(page.getByRole("status").filter({ hasText: "3 photos added." })).toBeVisible({ timeout: PHOTO_TIMEOUT_MS * 2 });
  const handles = page.getByTitle("Drag to change the order");

  // Act
  await handles.nth(2).dragTo(handles.nth(0));

  // Assert
  await expect(page.getByRole("status").filter({ hasText: "Photo moved." })).toBeVisible();
  await expect(page.getByLabel("Describe the main photo")).toHaveValue("Third photo");
  await expect(page.getByLabel("Describe the photo 2")).toHaveValue("First photo");
  await expect(page.getByLabel("Describe the photo 3")).toHaveValue("Second photo");
});

test("Add listing asks for a description of every chosen photo before saving", async ({ page }) => {
  // Arrange
  const admin = await createTestAdmin("manager");
  await signInFully(page, admin);
  await page.goto("/admin/listings/new");
  await page.getByLabel("Street address").fill("2 Describe St");
  await page.getByLabel("Choose photos").setInputFiles(TEST_PHOTO);

  // Act
  await page.getByRole("button", { name: "Save as draft" }).click();

  // Assert
  await expect(page.getByLabel("Describe the main photo")).toBeFocused();
  await expect(page).toHaveURL(/\/admin\/listings\/new$/);
});

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import { HAS_ADMIN_DATABASE, createTestAdmin, signInFully } from "./admin-helpers";

// Saved-state line under admin fields (owner choice 2026-10-09, docs/cwr-ads-analytics-review-plan.md
// Part B): "Saved", "Not saved yet", or "Nothing saved", read with the field by screen readers.
// The Ads & analytics wording is tested in tracking/tracking.spec.ts (it switches tracking on).

const SAVED = /Saved$/;
const NOT_SAVED = /Not saved yet$/;
const NOTHING_SAVED = /Nothing saved$/;

test.skip(!HAS_ADMIN_DATABASE, "Needs the local database and service-role key");

async function signInAs(page: Page, role: "owner" | "manager"): Promise<void> {
  await signInFully(page, await createTestAdmin(role));
}

async function createLeadThread(email: string): Promise<string> {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", { db: { schema: "cwr" }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: threadId, error } = await client.rpc("create_inbox_thread", { p_tenant_slug: "cwr", p_source: "contact", p_contact_name: "Saved State Lead", p_contact_email: email, p_contact_phone: "", p_subject: "Contact form", p_body: "Test lead" });
  if (error || typeof threadId !== "string") throw new Error(`Could not create lead: ${error?.message}`);
  return threadId;
}

async function createDraftListing(page: Page, streetAddress: string): Promise<void> {
  await page.goto("/admin/listings/new");
  await page.getByLabel("Street address").fill(streetAddress);
  await page.getByLabel("City").fill("Greensboro");
  await page.getByLabel("ZIP code").fill("27401");
  await page.getByLabel("Price", { exact: true }).fill("310,000");
  await page.getByLabel("About this property").fill("A test home for saved states.");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByText("Listing saved as a draft")).toBeVisible();
}

test("a new listing shows no saved lines until something is typed", async ({ page }) => {
  // Arrange
  await signInAs(page, "manager");
  await page.goto("/admin/listings/new");
  const city = page.getByLabel("City", { exact: true });

  // Act
  const untouchedDescription = await city.getAttribute("aria-describedby");
  await city.fill("Greensboro");

  // Assert
  expect(untouchedDescription).toBeNull();
  await expect(city).toHaveAccessibleDescription(NOT_SAVED);
});

test("an edited listing field says Not saved yet, then shows the stored value as Saved", async ({ page }) => {
  // Arrange
  await signInAs(page, "manager");
  await createDraftListing(page, `${Date.now()} Saved State Ln`);
  const price = page.getByLabel("Price", { exact: true });
  const bedrooms = page.getByLabel("Bedrooms (optional)");
  await expect(price).toHaveAccessibleDescription(SAVED);
  await expect(bedrooms).toHaveAccessibleDescription(NOTHING_SAVED);

  // Act
  await price.fill("$225000");
  await expect(price).toHaveAccessibleDescription(NOT_SAVED);
  await price.focus();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

  // Assert
  await expect(price).toHaveValue("225,000");
  await expect(price).toHaveAccessibleDescription(SAVED);
  await expect(page.getByRole("button", { name: "Save changes" })).toBeFocused();
});

test("letter case doesn't count as a change on fields stored in one case", async ({ page }) => {
  // Arrange
  await signInAs(page, "manager");
  await createDraftListing(page, `${Date.now()} Letter Case Ct`);
  const state = page.getByLabel("State", { exact: true });

  // Act
  await state.fill("VA");
  await expect(state).toHaveAccessibleDescription(NOT_SAVED);
  await state.fill("nc");

  // Assert
  await expect(state).toHaveAccessibleDescription(SAVED);
});

test("a checkbox and a select say Not saved yet when changed and Saved when changed back", async ({ page }) => {
  // Arrange
  await signInAs(page, "manager");
  await page.goto("/admin/connections/new");
  await page.getByLabel("Full name").fill(`Saved State Partner ${Date.now()}`);
  await page.getByRole("button", { name: "Add connection" }).click();
  await expect(page.getByText("Connection added")).toBeVisible();
  const visible = page.getByLabel("Show on the Connections page");
  const category = page.getByLabel("Category");
  const savedCategory = await category.inputValue();
  const otherCategory = await category.locator(`option:not([value="${savedCategory}"])`).first().getAttribute("value");

  // Act
  await visible.click();
  await category.selectOption(otherCategory ?? "");
  await expect(visible).toHaveAccessibleDescription(NOT_SAVED);
  await expect(category).toHaveAccessibleDescription(NOT_SAVED);
  await visible.click();
  await category.selectOption(savedCategory);

  // Assert
  await expect(visible).toHaveAccessibleDescription(SAVED);
  await expect(category).toHaveAccessibleDescription(SAVED);
});

test("contact settings show Saved, and Not saved yet while a box differs", async ({ page }) => {
  // Arrange
  await signInAs(page, "manager");
  await page.goto("/admin/contact");
  const phone = page.getByLabel("Main phone");
  await expect(phone).toHaveAccessibleDescription(SAVED);

  // Act
  await phone.fill("(336) 555-0199");

  // Assert
  await expect(phone).toHaveAccessibleDescription(NOT_SAVED);
});

test("a user's role says Not saved yet until Save role", async ({ page }) => {
  // Arrange
  const teammate = await createTestAdmin("staff");
  await signInAs(page, "owner");
  await page.goto("/admin/users");
  const row = page.getByRole("listitem").filter({ hasText: teammate.email });
  const role = row.getByRole("combobox", { name: "Role" });
  await expect(role).toHaveAccessibleDescription(SAVED);

  // Act
  await role.selectOption("manager");
  await expect(role).toHaveAccessibleDescription(NOT_SAVED);
  await row.getByRole("button", { name: `Save the role for ${teammate.email}` }).click();

  // Assert
  await expect(page.getByRole("status").filter({ hasText: "Role changed" })).toBeVisible();
  await expect(row.getByRole("combobox", { name: "Role" })).toHaveAccessibleDescription(SAVED);
});

test("sign-in fields never show a saved line", async ({ page }) => {
  // Arrange
  await page.goto("/admin/login");

  // Act
  await page.getByLabel("Email").fill("someone@example.com");

  // Assert
  await expect(page.getByText(/Not saved yet|Nothing saved/)).toHaveCount(0);
});

test("the download's delivery choice says Not saved yet when switched", async ({ page }) => {
  // Arrange
  await signInAs(page, "manager");
  await page.goto("/admin/homework/new-download");
  await page.getByLabel("A link to another website").check();
  await page.getByLabel("Web address").fill("https://www.ncrec.gov/");
  await page.getByLabel("Title", { exact: true }).fill(`Saved state link ${Date.now()}`);
  await page.getByRole("button", { name: "Add download or link" }).click();
  await expect(page.getByText("Item added")).toBeVisible();
  const delivery = page.getByRole("radiogroup", { name: "What visitors get" });
  await expect(delivery).toHaveAccessibleDescription(SAVED);

  // Act
  await page.getByLabel("A file to download").check();

  // Assert
  await expect(delivery).toHaveAccessibleDescription(NOT_SAVED);
});

test("the chat policy text says Not saved yet while edited", async ({ page }) => {
  // Arrange
  await signInAs(page, "owner");
  await page.goto("/admin/chat-policy");
  const policy = page.getByLabel("Policy text");

  // Act
  await policy.fill(`# Office hours\nSaved state check ${Date.now()}`);

  // Assert
  await expect(policy).toHaveAccessibleDescription(NOT_SAVED);
});

test("a closed deal saved with a differently written price shows the stored price as Saved", async ({ page }) => {
  // Arrange
  await signInAs(page, "manager");
  await page.goto(`/admin/inbox/${await createLeadThread(`saved-state-${Date.now()}@example.com`)}`);
  const price = page.getByLabel("Sale price (optional)");
  await page.getByLabel("Closing date").fill("2026-09-20");
  await price.fill("350,000");
  await page.getByRole("button", { name: "Save closed deal" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Closed deal saved" })).toBeVisible();
  await expect(price).toHaveAccessibleDescription(SAVED);

  // Act
  await price.fill("$350000");
  await expect(price).toHaveAccessibleDescription(NOT_SAVED);
  await page.getByRole("button", { name: "Save closed deal" }).click();

  // Assert
  await expect(price).toHaveValue("350,000");
  await expect(price).toHaveAccessibleDescription(SAVED);
});

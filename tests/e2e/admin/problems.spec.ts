import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import { HAS_ADMIN_DATABASE, createTestAdmin, signInFully } from "./admin-helpers";

// Problem tracking end to end (docs/cwr-error-tracking-plan.md): what a person sees on screen
// is recorded with the same reference code; uploads that break always finish with a message;
// only owners choose who gets problem emails.

const FIXTURES = path.join(__dirname, "..", "..", "fixtures");
const TEST_GUIDE = path.join(FIXTURES, "test-guide.pdf");
const NOT_A_GUIDE = path.join(FIXTURES, "not-a-guide.txt");
const REFERENCE_PATTERN = /CWR-[0-9A-Z]{3}-[0-9A-Z]{3}/;
const SERVER_ACTION_HEADER = "next-action";

test.skip(!HAS_ADMIN_DATABASE, "Needs the local database and service-role key");

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    db: { schema: "cwr" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchProblem(reference: string) {
  const { data, error } = await getServiceClient().from("problem_events").select("action, stage, severity, code").eq("reference", reference).maybeSingle();
  if (error) throw new Error(`Could not read the problem log: ${error.message}`);
  return data;
}

async function addDownload(page: Page, title: string): Promise<void> {
  await page.goto("/admin/homework/new-download");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Group").selectOption({ label: "For buyers" });
  await page.getByRole("button", { name: "Add download or link" }).click();
  await expect(page.getByText("Item added")).toBeVisible();
}

test("a dropped connection while saving is explained, and its reference is in the problem log", async ({ page }) => {
  // Arrange
  await signInFully(page, await createTestAdmin("manager"));
  await addDownload(page, `Dropped save ${Date.now()}`);
  await page.route("**/admin/homework/**", (route) => (route.request().headers()[SERVER_ACTION_HEADER] ? route.abort("failed") : route.continue()));

  // Act
  await page.getByLabel("Title").fill(`Renamed ${Date.now()}`);
  await page.getByRole("button", { name: "Save changes" }).click();
  const message = page.getByText(/Connection problem\. Check your internet and try again\./);
  await expect(message).toBeVisible();
  const reference = REFERENCE_PATTERN.exec((await message.textContent()) ?? "")?.[0] ?? "";

  // Assert
  expect(await fetchProblem(reference)).toEqual({ action: "homework.update_download", stage: "network", severity: "warning", code: "network" });
});

test("a cut-off Homework upload always finishes with a message and is recorded", async ({ page }) => {
  // Arrange
  await signInFully(page, await createTestAdmin("manager"));
  await addDownload(page, `Cut-off upload ${Date.now()}`);
  await page.route("**/storage/v1/object/upload/sign/**", (route) => route.abort("connectionreset"));

  // Act
  await page.getByLabel("Choose a file").setInputFiles(TEST_GUIDE);
  await page.getByRole("button", { name: "Upload file" }).click();
  const message = page.getByText(REFERENCE_PATTERN);
  await expect(message).toBeVisible();
  const reference = REFERENCE_PATTERN.exec((await message.textContent()) ?? "")?.[0] ?? "";

  // Assert
  expect(await fetchProblem(reference)).toMatchObject({ action: "homework.upload_file", stage: "network" });
});

test("a typing mistake is recorded without a reference code on screen", async ({ page }) => {
  // Arrange
  await signInFully(page, await createTestAdmin("manager"));
  await addDownload(page, `Wrong type ${Date.now()}`);

  // Act
  await page.getByLabel("Choose a file").setInputFiles(NOT_A_GUIDE);
  await page.getByRole("button", { name: "Upload file" }).click();

  // Assert
  await expect(page.getByText("This file type isn't accepted here. Accepted: PDF, PowerPoint, Word, Excel.")).toBeVisible();
  await expect(page.getByText(REFERENCE_PATTERN)).toHaveCount(0);
});

test("only owners choose who gets problem emails", async ({ page }) => {
  // Arrange
  const fullName = `Problem Watcher ${Date.now()}`;
  const { error } = await getServiceClient().from("notification_recipients").insert({ tenant_id: (await getServiceClient().from("tenants").select("id").eq("slug", "cwr").single()).data?.id, full_name: fullName, email: `watcher-${Date.now()}@example.com` });
  if (error) throw new Error(`Could not add a recipient: ${error.message}`);
  await signInFully(page, await createTestAdmin("manager"));
  await page.goto("/admin/notifications");
  await expect(page.getByRole("button", { name: `Send problem emails to ${fullName}` })).toHaveCount(0);
  await page.context().clearCookies();
  await signInFully(page, await createTestAdmin("owner"));

  // Act
  await page.goto("/admin/notifications");
  await page.getByRole("button", { name: `Send problem emails to ${fullName}` }).click();

  // Assert
  await expect(page.getByRole("status").filter({ hasText: "They'll get problem emails." })).toBeVisible();
});

import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { HAS_ADMIN_DATABASE, createTestAdmin, signInFully } from "./admin-helpers";

// The owners' Problems page and the public site's error watcher
// (docs/error-logging-a-grade-plan.md, Phases B and D).

test.skip(!HAS_ADMIN_DATABASE, "Needs the local database and service-role key");

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    db: { schema: "cwr" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Records a crash as the server would, with a message unique to this test; returns its reference. */
async function recordTestCrash(message: string): Promise<string> {
  const { data, error } = await getServiceClient().rpc("record_problem", {
    p: { id: randomUUID(), origin: "server_member", action: "portal.page_crash", stage: "unexpected", severity: "error", code: "TypeError", detail: message, group_key: message, shown_message: "Something went wrong" },
  });
  if (error) throw new Error(`Could not record a test problem: ${error.message}`);
  return (data as { reference: string }).reference;
}

async function fetchBrowserErrorCount(): Promise<number> {
  const { count, error } = await getServiceClient().from("problem_events").select("id", { count: "exact", head: true }).eq("action", "site.browser_error");
  if (error) throw new Error(`Could not read the problem log: ${error.message}`);
  return count ?? 0;
}

test("an owner finds a problem by its reference and marks it resolved", async ({ page }) => {
  // Arrange
  const reference = await recordTestCrash(`Test crash ${randomUUID()}`);
  await signInFully(page, await createTestAdmin("owner"));
  await page.goto("/admin/problems");

  // Act
  await page.getByLabel("Find a reference code or request ID").fill(reference);
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page.getByText(reference)).toBeVisible();
  await page.getByLabel("What was done about it (optional)").fill("Fixed in the test");
  await page.getByRole("button", { name: "Mark resolved" }).click();

  // Assert
  await expect(page.getByText("Resolved: Fixed in the test")).toBeVisible();
});

test("a reference that never reached the log says where to look instead", async ({ page }) => {
  // Arrange
  await signInFully(page, await createTestAdmin("owner"));
  await page.goto("/admin/problems");

  // Act
  await page.getByLabel("Find a reference code or request ID").fill("CWR-ZZZ-ZZ9");
  await page.getByRole("button", { name: "Find" }).click();

  // Assert
  await expect(page.getByText(/Not in the log: it was only written to the server log/)).toBeVisible();
});

test("the list shows open problems and the dashboard links to it", async ({ page }) => {
  // Arrange
  const message = `Listed crash ${randomUUID()}`;
  await recordTestCrash(message);
  await signInFully(page, await createTestAdmin("owner"));
  await page.goto("/admin");

  // Act
  await page.getByRole("link", { name: "See problems" }).click();

  // Assert
  await expect(page.getByRole("link", { name: /Admin portal: Open an admin page/ }).first()).toBeVisible();
});

test("a manager can't open the Problems page", async ({ page }) => {
  // Arrange
  await signInFully(page, await createTestAdmin("manager"));

  // Act
  await page.goto("/admin/problems");

  // Assert
  await expect(page.getByRole("heading", { name: "Problems", exact: true })).toHaveCount(0);
});

test("a browser error on a public page is recorded", async ({ page }) => {
  // Arrange
  const before = await fetchBrowserErrorCount();
  await page.goto("/");

  // Act
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error(`Public page test error ${Date.now()}`);
    });
  });

  // Assert
  await expect.poll(fetchBrowserErrorCount).toBeGreaterThan(before);
});

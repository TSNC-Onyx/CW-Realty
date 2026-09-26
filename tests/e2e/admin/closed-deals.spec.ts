import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { HAS_ADMIN_DATABASE, createTestAdmin, signInFully } from "./admin-helpers";

// Phase 6: closed deals on inbox conversations, their downloads, and the owner-only
// Ads & analytics area.

test.skip(!HAS_ADMIN_DATABASE, "Needs the local database and service-role key");

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    db: { schema: "cwr" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createLead({ name, email, gclid }: { name: string; email: string; gclid: string | null }): Promise<string> {
  const client = getServiceClient();
  const { data: threadId, error } = await client.rpc("create_inbox_thread", { p_tenant_slug: "cwr", p_source: "contact", p_contact_name: name, p_contact_email: email, p_contact_phone: "", p_subject: "Contact form", p_body: "Test lead" });
  if (error || typeof threadId !== "string") throw new Error(`Could not create lead: ${error?.message}`);
  if (!gclid) return threadId;
  const { data: tenant } = await client.from("tenants").select("id").eq("slug", "cwr").single();
  const row = { tenant_id: tenant?.id, thread_id: threadId, gclid, gbraid: null, wbraid: null, fbc: null, fbp: null, utm_source: null, utm_medium: null, utm_campaign: null, utm_term: null, utm_content: null, landing_path: "/" };
  const { error: attributionError } = await client.from("lead_attribution").insert(row);
  if (attributionError) throw new Error(`Could not add attribution: ${attributionError.message}`);
  return threadId;
}

test("a manager records a closed deal and only consented leads go into the Google Ads file", async ({ page }) => {
  // Arrange
  const stamp = Date.now();
  const gclid = `ClosedDealTest${stamp}`;
  const consentedId = await createLead({ name: `Deal Consented ${stamp}`, email: `deal-yes-${stamp}@example.com`, gclid });
  const privateId = await createLead({ name: `Deal Private ${stamp}`, email: `deal-no-${stamp}@example.com`, gclid: null });
  const manager = await createTestAdmin("manager");
  await signInFully(page, manager);

  // Act
  for (const threadId of [consentedId, privateId]) {
    await page.goto(`/admin/inbox/${threadId}`);
    await page.getByLabel("Closing date").fill("2026-09-20");
    await page.getByLabel("Sale price (optional)").fill("350,000");
    await page.getByRole("button", { name: "Save closed deal" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Closed deal saved" })).toBeVisible();
  }
  const download = await page.request.get("/admin/closed-deals/download/google-ads");

  // Assert
  const csv = await download.text();
  const privateEmailHash = createHash("sha256").update(`deal-no-${stamp}@example.com`).digest("hex");
  expect({ hasConsentedLead: csv.includes(`${gclid},`), hasPrivateLead: csv.includes(privateEmailHash) }).toEqual({ hasConsentedLead: true, hasPrivateLead: false });
  await page.goto("/admin/closed-deals");
  await expect(page.getByText("not shared (no advertising consent recorded)").first()).toBeVisible();
});

test("a removed closed deal goes to the trash and can be restored", async ({ page }) => {
  // Arrange
  const stamp = Date.now();
  const name = `Deal Trash ${stamp}`;
  const threadId = await createLead({ name, email: `deal-trash-${stamp}@example.com`, gclid: null });
  const manager = await createTestAdmin("manager");
  await signInFully(page, manager);
  await page.goto(`/admin/inbox/${threadId}`);
  await page.getByLabel("Closing date").fill("2026-09-21");
  await page.getByRole("button", { name: "Save closed deal" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Closed deal saved" })).toBeVisible();
  await page.reload();

  // Act
  await page.getByRole("button", { name: "Move this closed deal to the trash" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Moved to trash" })).toBeVisible();
  await page.goto("/admin/trash");

  // Assert
  await expect(page.getByRole("button", { name: `Restore Closed deal: ${name}` })).toBeVisible();
});

test("staff cannot see closed deals or download them", async ({ page }) => {
  // Arrange
  const staff = await createTestAdmin("staff");
  await signInFully(page, staff);

  // Act
  const download = await page.request.get("/admin/closed-deals/download/meta");

  // Assert
  expect(download.status()).toBe(403);
  await page.goto("/admin/closed-deals");
  await expect(page).toHaveURL(/\/admin\?notice=role/);
});

test("only owners can open Ads & analytics", async ({ page }) => {
  // Arrange
  const manager = await createTestAdmin("manager");
  await signInFully(page, manager);

  // Act
  await page.goto("/admin/tracking");

  // Assert
  await expect(page).toHaveURL(/\/admin\?notice=role/);
});

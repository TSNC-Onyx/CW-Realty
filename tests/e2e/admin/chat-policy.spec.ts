import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import { HAS_ADMIN_DATABASE, createTestAdmin, signInFully, waitForBotCheck, type TestAdmin } from "./admin-helpers";

// Phase 5: owner-only chatbot policy (Admin §6) and the chat history review (Features §2).
// Serial: every test shares the one CWR policy history.

test.skip(!HAS_ADMIN_DATABASE, "Needs the local database and service-role key");
test.describe.configure({ mode: "serial" });

const POLICY_PATH = "/admin/chat-policy";

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    db: { schema: "cwr" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Stands in for a passing test run, which needs the Anthropic key CI does not have. */
async function recordPassingRun(): Promise<void> {
  const client = getServiceClient();
  const { data: tenant } = await client.from("tenants").select("id").eq("slug", "cwr").single();
  const { data: draft } = await client.from("chat_policies").select("id, updated_at").eq("tenant_id", tenant?.id).eq("status", "draft").order("version", { ascending: false }).limit(1).single();
  const { data: newestTest } = await client.from("chat_policy_tests").select("updated_at").eq("tenant_id", tenant?.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const { error } = await client.rpc("record_chat_policy_test_run", { p_policy_id: draft?.id, p_policy_updated_at: draft?.updated_at, p_tests_updated_at: newestTest?.updated_at ?? null, p_is_passed: true, p_results: [], p_ran_by: null });
  if (error) throw new Error(`Could not record a test run: ${error.message}`);
}

async function saveDraft(page: Page, body: string): Promise<void> {
  await page.getByLabel("Policy text").fill(body);
  await page.getByRole("button", { name: "Save draft" }).click();
}

let owner: TestAdmin;

test.beforeAll(async () => {
  owner = await createTestAdmin("owner");
});

test("managers cannot open the chatbot policy but can read chat history", async ({ page }) => {
  // Arrange
  const manager = await createTestAdmin("manager");
  await signInFully(page, manager);

  // Act
  await page.goto(POLICY_PATH);

  // Assert
  await expect(page.getByText("That area isn't part of your role")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Chatbot policy" })).toHaveCount(0);
  await page.goto("/admin/chats");
  await expect(page.getByRole("heading", { level: 1, name: "Chat history" })).toBeVisible();
});

test("a policy without a section heading is not saved", async ({ page }) => {
  // Arrange
  await signInFully(page, owner);
  await page.goto(POLICY_PATH);

  // Act
  await saveDraft(page, "We are open weekdays.");

  // Assert
  await expect(page.locator("#policy-body-error")).toContainText("Add at least one section heading");
});

test("the owner saves a draft, and publishing waits for a passing test run", async ({ page }) => {
  // Arrange
  await signInFully(page, owner);
  await page.goto(POLICY_PATH);

  // Act
  await saveDraft(page, "# Office hours\nWe are open weekdays from 9 to 5.");

  // Assert
  await expect(page.getByRole("status").filter({ hasText: /draft version \d+/i })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Publish this draft to the website chat" })).toBeDisabled();
});

test("running the tests explains that the assistant is not connected yet", async ({ page }) => {
  // Arrange
  await signInFully(page, owner);
  await page.goto(POLICY_PATH);
  await page.getByLabel("Question a visitor might ask").fill("When are you open?");
  await page.getByLabel("Section it should cite").fill("Office hours");
  await page.getByRole("button", { name: "Add question" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Test question added." })).toBeVisible();

  // Act
  await page.getByRole("button", { name: "Run the tests on the saved draft" }).click();

  // Assert
  await expect(page.getByRole("alert").filter({ hasText: /isn't connected yet/ })).toBeVisible();
});

test("after a passing run the owner publishes, then restores an old version as a new draft", async ({ page }) => {
  // Arrange
  await recordPassingRun();
  await signInFully(page, owner);
  await page.goto(POLICY_PATH);

  // Act
  await page.getByRole("button", { name: "Publish this draft to the website chat" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /^Restore version \d+ as a new draft$/ }).first().click();

  // Assert
  await expect(page.getByRole("status").filter({ hasText: /copied into new draft version/ })).toBeVisible();
  await page.reload();
  await expect(page.getByText(/^Version \d+ is live, published/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Editing draft version \d+$/ })).toBeVisible();
});

test("a chat hand-off reaches the inbox with the conversation, and the chat is in the history", async ({ page }) => {
  // Arrange
  const visitorName = `Chat Visitor ${Date.now()}`;
  await page.goto("/about");
  await page.getByRole("button", { name: "Chat with us" }).click();
  await page.getByLabel("Your question").fill("Do you handle rentals?");
  await waitForBotCheck(page);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("log", { name: "Chat messages" }).getByText(/a person on our team can/)).toBeVisible();

  // Act
  await page.getByRole("button", { name: "Talk to a person" }).click();
  await page.getByLabel("Full name").fill(visitorName);
  await page.getByLabel("Email").fill("chat-visitor@example.com");
  await waitForBotCheck(page);
  await page.getByRole("button", { name: "Send to our team" }).click();
  await expect(page.getByRole("heading", { name: /A person will reply/ })).toBeVisible();

  // Assert
  await signInFully(page, owner);
  await page.goto("/admin/inbox?status=new");
  await page.getByRole("link", { name: new RegExp(visitorName) }).click();
  await expect(page.getByText("Chat with the AI assistant so far:", { exact: false })).toBeVisible();
  await page.goto("/admin/chats?show=handoffs");
  await page.getByRole("link", { name: /Do you handle rentals\?/ }).first().click();
  await expect(page.getByRole("link", { name: /open the inbox message/ })).toBeVisible();
});

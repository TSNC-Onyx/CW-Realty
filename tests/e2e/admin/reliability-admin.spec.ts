import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import { HAS_ADMIN_DATABASE, createTestAdmin, signInFully, waitForBotCheck } from "./admin-helpers";

// Sign-in pages that are out of date (docs/cwr-stale-quick-check-addendum.md; decision DA1)
// and the owner's Assistant on/off switch (decision D4).

const OLD_SITE_KEY = "1x00000000000000000000AB";
const SERVER_ACTION_HEADER = "next-action";
const TOKEN_SAFE_AGE = "04:40";

/** Sends an older Quick Check key, as a page built before the latest keys would (see reliability.spec.ts). */
async function makePageOutdated(page: Page): Promise<void> {
  await page.evaluate((oldKey) => {
    window.addEventListener("submit", (event) => (event.target as HTMLFormElement).querySelectorAll<HTMLInputElement>('input[name="botCheckKey"]').forEach((input) => (input.value = oldKey)), { capture: true });
  }, OLD_SITE_KEY);
}

test.skip(!HAS_ADMIN_DATABASE, "Needs the local database and service-role key");

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    db: { schema: "cwr" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchIsAssistantOn(): Promise<boolean | null> {
  const client = getServiceClient();
  const { data: tenant } = await client.from("tenants").select("id").eq("slug", "cwr").single();
  const { data } = await client.from("site_settings").select("is_assistant_on").eq("tenant_id", tenant?.id).maybeSingle();
  return data?.is_assistant_on ?? null;
}

async function fetchProblemSince({ action, code, since }: { action: string; code: string; since: string }) {
  const { data } = await getServiceClient().from("problem_events").select("origin, severity").eq("action", action).eq("code", code).gte("occurred_at", since).limit(1).maybeSingle();
  return data;
}

async function fillSignIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("staff@example.com");
  await page.getByLabel("Password").fill("Not-a-real-password-1");
  await waitForBotCheck(page);
}

test.afterAll(async () => {
  const client = getServiceClient();
  const { data: tenant } = await client.from("tenants").select("id").eq("slug", "cwr").single();
  await client.from("site_settings").update({ is_assistant_on: true }).eq("tenant_id", tenant?.id);
});

test("an out-of-date sign-in page refreshes itself and keeps the email, never the password", async ({ page }) => {
  // Arrange
  test.skip(!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, "Needs the test site key");
  const since = new Date().toISOString();
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("staff@example.com");
  await page.getByLabel("Password").fill("Not-a-real-password-1");
  await waitForBotCheck(page);
  await makePageOutdated(page);

  // Act
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("This page was out of date. Refreshing it for you…")).toBeVisible();

  // Assert
  await expect(page.getByLabel("Email")).toHaveValue("staff@example.com", { timeout: 10_000 });
  await expect(page.getByLabel("Password")).toHaveValue("");
  await expect(page.getByLabel("Password")).toBeFocused();
  const { data } = await getServiceClient().from("problem_events").select("severity").eq("action", "auth.sign_in").eq("code", "outdated_page").gte("occurred_at", since).limit(1).maybeSingle();
  expect(data).toEqual({ severity: "warning" });
});

test("after refreshing didn't help, the sign-in page says to reopen it instead of refreshing again", async ({ page }) => {
  // Arrange
  test.skip(!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, "Needs the test site key");
  const since = new Date().toISOString();
  await fillSignIn(page);
  await page.evaluate(() => window.sessionStorage.setItem("cwr-page-refreshed-at", String(Date.now())));
  await makePageOutdated(page);

  // Act
  await page.getByRole("button", { name: "Sign in" }).click();

  // Assert
  await expect(page.getByText("Refreshing didn't fix it. Close this tab and open the page again.")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Call / })).toBeVisible();
  await expect.poll(() => fetchProblemSince({ action: "auth.sign_in", code: "outdated_page_loop", since })).toMatchObject({ origin: "browser_signin", severity: "warning" });
});

test("a sign-in page left open across a release refreshes itself instead of showing an error", async ({ page }) => {
  // Arrange
  test.skip(!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, "Needs the test site key");
  const since = new Date().toISOString();
  await fillSignIn(page);
  await page.route("**/admin/login**", (route) => {
    const headers = route.request().headers();
    return headers[SERVER_ACTION_HEADER] ? route.continue({ headers: { ...headers, [SERVER_ACTION_HEADER]: "0".repeat(42) } }) : route.continue();
  });

  // Act
  await page.getByRole("button", { name: "Sign in" }).click();

  // Assert
  await expect(page.getByText("This page was out of date. Refreshing it for you…")).toBeVisible();
  await expect.poll(() => fetchProblemSince({ action: "auth.sign_in", code: "stale_page", since })).toMatchObject({ origin: "browser_signin", severity: "warning" });
});

test("a check that went stale (a laptop slept) is renewed first, so one press of Sign in still goes through", async ({ page }) => {
  // Arrange
  test.skip(!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, "Needs the test site key");
  await page.clock.install();
  await fillSignIn(page);
  await page.clock.fastForward(TOKEN_SAFE_AGE);

  // Act
  await page.getByRole("button", { name: "Sign in" }).click();

  // Assert
  await expect(page.getByText("That email and password don't match an account. Check them and try again.")).toBeVisible({ timeout: 20_000 });
});

test("an owner can turn the chat assistant off and back on", async ({ page }) => {
  // Arrange
  await signInFully(page, await createTestAdmin("owner"));
  await page.goto("/admin/chat-policy");

  // Act
  await page.getByRole("button", { name: "Turn the website chat assistant off" }).click();
  await expect(page.getByText("Off — every visitor is offered a person.")).toBeVisible();
  const isOnAfterOff = await fetchIsAssistantOn();
  await page.getByRole("button", { name: "Turn the website chat assistant on" }).click();
  await expect(page.getByText("On — the assistant answers visitors from the live policy.")).toBeVisible();

  // Assert
  expect({ isOnAfterOff, isOnAfterOn: await fetchIsAssistantOn() }).toEqual({ isOnAfterOff: false, isOnAfterOn: true });
});

import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import { Secret, TOTP } from "otpauth";

// Test-only helpers: create admin accounts with the service-role key and sign in through
// the real screens, answering the authenticator step with a generated code.

export type TestAdminRole = "owner" | "manager" | "staff";

export type TestAdmin = { email: string; password: string; totpSecret: string | null };

export const HAS_ADMIN_DATABASE = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    db: { schema: "cwr" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createTestAdmin(role: TestAdminRole | null): Promise<TestAdmin> {
  const client = getServiceClient();
  const email = `${role ?? "outsider"}-${randomUUID()}@test.cwr`;
  const password = `Test-${randomUUID()}-Aa1`;
  const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`Could not create test user: ${error?.message}`);
  if (role) {
    const { data: tenant } = await client.from("tenants").select("id").eq("slug", "cwr").single();
    const { error: membershipError } = await client.from("memberships").insert({ tenant_id: tenant?.id, user_id: data.user.id, role });
    if (membershipError) throw new Error(`Could not add membership: ${membershipError.message}`);
  }
  return { email, password, totpSecret: null };
}

export function getTotpCode(secret: string): string {
  return new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate();
}

/** Waits for Cloudflare Turnstile (test keys pass automatically) to put its token in the form. */
export async function waitForBotCheck(page: Page): Promise<void> {
  if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return;
  await expect.poll(async () => page.locator('input[name="cf-turnstile-response"]').first().inputValue().catch(() => ""), { timeout: 20_000 }).not.toBe("");
}

export async function signInWithPassword(page: Page, admin: TestAdmin): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(admin.email);
  await page.getByLabel("Password").fill(admin.password);
  await waitForBotCheck(page);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signs in and, the first time, sets up the authenticator. Mutates admin.totpSecret. */
export async function signInFully(page: Page, admin: TestAdmin): Promise<void> {
  await signInWithPassword(page, admin);
  if (admin.totpSecret === null) {
    await page.getByRole("button", { name: "Show my setup code" }).click();
    admin.totpSecret = (await page.getByTestId("mfa-secret").textContent())?.trim() ?? "";
    await page.getByLabel("6-digit code").fill(getTotpCode(admin.totpSecret));
    await page.getByRole("button", { name: "Turn on sign-in codes" }).click();
  } else {
    await page.getByLabel("6-digit code").fill(getTotpCode(admin.totpSecret));
    await page.getByRole("button", { name: "Verify code" }).click();
  }
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
}

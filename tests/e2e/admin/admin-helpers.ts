import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import { Secret, TOTP } from "otpauth";

// Test-only helpers: create admin accounts with the service-role key and sign in through
// the real screens with email and password (no authenticator code since 2026-10-09).

export type TestAdminRole = "owner" | "manager" | "staff";

export type TestAdmin = { email: string; password: string };

export const HAS_ADMIN_DATABASE = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export function getServiceClient() {
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
  return { email, password };
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

/** Signs in with email and password and waits for the dashboard. */
export async function signInFully(page: Page, admin: TestAdmin): Promise<void> {
  await signInWithPassword(page, admin);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
}

/** Gives an account a working authenticator, as accounts set up before 2026-10-09 have. */
export async function addOldSignInCode(admin: TestAdmin): Promise<void> {
  // A one-time sign-in link starts the session here, so the website's bot check isn't needed.
  const { data: link, error: linkError } = await getServiceClient().auth.admin.generateLink({ type: "magiclink", email: admin.email });
  if (linkError) throw new Error(`Could not make a sign-in link: ${linkError.message}`);
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await client.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (signInError) throw new Error(`Could not sign in to add a code: ${signInError.message}`);
  const { data: factor, error: enrollError } = await client.auth.mfa.enroll({ factorType: "totp" });
  if (enrollError) throw new Error(`Could not add a code: ${enrollError.message}`);
  const { error: verifyError } = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: getTotpCode(factor.totp.secret) });
  if (verifyError) throw new Error(`Could not confirm the code: ${verifyError.message}`);
}

/**
 * The emailed password-reset link for an account. Opened on "localhost": the local server
 * forwards to localhost after checking the link, so the sign-in cookie must be set there too.
 */
export async function fetchResetLink({ email, baseUrl }: { email: string; baseUrl: string }): Promise<string> {
  const { data, error } = await getServiceClient().auth.admin.generateLink({ type: "recovery", email });
  if (error) throw new Error(`Could not make a reset link: ${error.message}`);
  const link = new URL(`/admin/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery`, baseUrl);
  link.hostname = "localhost";
  return link.toString();
}

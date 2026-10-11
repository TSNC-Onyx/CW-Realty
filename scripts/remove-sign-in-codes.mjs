// One-time step when admin sign-in became email and password only (owner choice 2026-10-09,
// docs/cwr-password-only-sign-in-plan.md). Supabase refuses a password change at password-only
// level for an account that still has an authenticator set up, so the old codes are removed
// from every CWR admin account. Each removal is written to the activity log.
//
// Lists only (dry run):  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/remove-sign-in-codes.mjs
// Removes:               SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/remove-sign-in-codes.mjs --apply

import { createClient } from "@supabase/supabase-js";

const TENANT_SLUG = "cwr";
const APPLY_FLAG = "--apply";

class SignInCodeError extends Error {
  constructor(message) {
    super(message);
    this.name = "SignInCodeError";
  }
}

function getSettings() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new SignInCodeError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  return { url, serviceRoleKey, isApplying: process.argv.slice(2).includes(APPLY_FLAG) };
}

async function fetchMembers(client) {
  const { data: tenant, error: tenantError } = await client.from("tenants").select("id").eq("slug", TENANT_SLUG).single();
  if (tenantError) throw new SignInCodeError(`CWR tenant not found: ${tenantError.message}`);
  const { data: memberships, error } = await client.from("memberships").select("user_id, role").eq("tenant_id", tenant.id);
  if (error) throw new SignInCodeError(`Could not list people with access: ${error.message}`);
  return { memberships };
}

async function fetchFactors(client, userId) {
  const { data, error } = await client.auth.admin.getUserById(userId);
  if (error) throw new SignInCodeError(`Could not read account ${userId}: ${error.message}`);
  return { email: data.user?.email ?? userId, factorIds: (data.user?.factors ?? []).map((factor) => factor.id) };
}

// One at a time, so a failure part-way says exactly how many codes were already removed.
async function removeFactors(client, { userId, email, factorIds }) {
  for (const [index, id] of factorIds.entries()) {
    const { error } = await client.auth.admin.mfa.deleteFactor({ userId, id });
    if (error) throw new SignInCodeError(`${email}: removed ${index} of ${factorIds.length} codes, then: ${error.message}. Run again to finish.`);
  }
}

async function recordRemoval(client, userId) {
  const { error } = await client.rpc("record_sign_in_codes_removed", { p_user_id: userId });
  if (error) console.warn(`Removed, but not added to the activity log: ${error.message}`);
}

async function main() {
  const { url, serviceRoleKey, isApplying } = getSettings();
  const client = createClient(url, serviceRoleKey, { db: { schema: "cwr" }, auth: { persistSession: false, autoRefreshToken: false } });
  const { memberships } = await fetchMembers(client);
  let affectedCount = 0;
  for (const { user_id: userId, role } of memberships) {
    const { email, factorIds } = await fetchFactors(client, userId);
    if (factorIds.length === 0) continue;
    affectedCount += 1;
    if (!isApplying) {
      console.log(`Would remove ${factorIds.length} sign-in code(s) from ${email} (${role}).`);
      continue;
    }
    await removeFactors(client, { userId, email, factorIds });
    await recordRemoval(client, userId);
    console.log(`Removed ${factorIds.length} sign-in code(s) from ${email} (${role}).`);
  }
  if (affectedCount === 0) console.log("No admin account has a sign-in code. Nothing to do.");
  else if (!isApplying) console.log(`Dry run: ${affectedCount} account(s). Run again with ${APPLY_FLAG} to remove.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

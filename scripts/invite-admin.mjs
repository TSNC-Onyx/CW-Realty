// Invites a person to the CWR admin portal with a role — used once to create the first
// owner (after that, owners invite people from "Users & roles").
// The invite email (supabase/templates/invite.html) lets them set a password; they turn
// on sign-in codes at first sign-in.
//
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/invite-admin.mjs person@example.com owner

import { createClient } from "@supabase/supabase-js";

const ROLES = ["owner", "manager", "staff"];
const TENANT_SLUG = "cwr";

class InviteError extends Error {
  constructor(message) {
    super(message);
    this.name = "InviteError";
  }
}

function getArguments() {
  const [email, role] = process.argv.slice(2);
  if (!email || !email.includes("@")) throw new InviteError("Give an email address, e.g. person@example.com");
  if (!ROLES.includes(role)) throw new InviteError(`Give a role: ${ROLES.join(", ")}`);
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new InviteError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  return { email, role, url, serviceRoleKey };
}

async function main() {
  const { email, role, url, serviceRoleKey } = getArguments();
  const client = createClient(url, serviceRoleKey, { db: { schema: "cwr" }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: tenant, error: tenantError } = await client.from("tenants").select("id").eq("slug", TENANT_SLUG).single();
  if (tenantError) throw new InviteError(`CWR tenant not found: ${tenantError.message}`);
  const { data: invited, error: inviteError } = await client.auth.admin.inviteUserByEmail(email);
  if (inviteError) throw new InviteError(`Invite failed: ${inviteError.message}`);
  const { error: membershipError } = await client.from("memberships").insert({ tenant_id: tenant.id, user_id: invited.user.id, role });
  if (membershipError) throw new InviteError(`Could not give access: ${membershipError.message}`);
  console.log(`Invited ${email} as ${role}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

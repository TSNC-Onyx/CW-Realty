import "server-only";

import { createClient } from "@supabase/supabase-js";

import { MissingDatabaseSettingsError } from "@/lib/supabase/server-client";

// Service-role access, server only (Infra §2). Used after the caller has been checked
// with requireAdmin, for work RLS cannot express: inviting users, reading their emails,
// issuing signed photo upload URLs, and deleting photo files.

function getServiceSettings(): { url: string; serviceRoleKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new MissingDatabaseSettingsError();
  return { url, serviceRoleKey };
}

/** False when the Worker is missing the service-role secret (email lookups, invites, uploads need it). */
export function isServiceAccessConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createServiceClient() {
  const { url, serviceRoleKey } = getServiceSettings();
  return createClient(url, serviceRoleKey, {
    db: { schema: "cwr" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

import { REQUEST_ID_HEADER } from "@/lib/observability/request-id";

// Signed-in (admin) access to the cwr schema through the visitor's session cookies.
// Row Level Security applies to every query; the request ID reaches the audit log.

const CWR_SCHEMA = "cwr";

export class MissingDatabaseSettingsError extends Error {
  constructor() {
    super("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set for the admin portal");
    this.name = "MissingDatabaseSettingsError";
  }
}

function getDatabaseSettings(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new MissingDatabaseSettingsError();
  return { url, publishableKey };
}

export async function createSessionClient() {
  const { url, publishableKey } = getDatabaseSettings();
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const requestId = headerStore.get(REQUEST_ID_HEADER);
  return createServerClient(url, publishableKey, {
    db: { schema: CWR_SCHEMA },
    global: { headers: requestId ? { [REQUEST_ID_HEADER]: requestId } : {} },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        // Server Components cannot write cookies; the middleware refreshes the
        // session on every admin request, so a skipped write here is expected.
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          return;
        }
      },
    },
  });
}

export type SessionClient = Awaited<ReturnType<typeof createSessionClient>>;

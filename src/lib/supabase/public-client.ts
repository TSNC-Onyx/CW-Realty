import { createClient } from "@supabase/supabase-js";

// Visitor-level (anon) access to the cwr schema. Row Level Security limits it to
// published content, so the publishable key is safe in the browser and at the edge.

const CWR_SCHEMA = "cwr";
const REQUEST_TIMEOUT_MS = 1500;

export const CWR_TENANT_SLUG = "cwr";

export class SupabaseQueryError extends Error {
  constructor(message: string, readonly context: { operation: string; cause?: unknown }) {
    super(message);
    this.name = "SupabaseQueryError";
  }
}

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return null;
  return createClient(url, publishableKey, {
    db: { schema: CWR_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchWithTimeout },
  });
}

export type PublicClient = NonNullable<ReturnType<typeof createPublicClient>>;

// Holds configuration only (URL, key); no per-request or per-user state.
const publicClient = createPublicClient();

/** Null when the site runs without database settings (e.g. CI browser tests). */
export function getPublicClient(): PublicClient | null {
  return publicClient;
}

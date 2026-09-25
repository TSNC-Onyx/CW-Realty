import "server-only";

import { getCloudflareBinding } from "@/lib/platform/cloudflare-bindings";

// Per-visitor limit on public form posts (Infra §2 "rate limit all public endpoints"),
// using the Workers Rate Limiting binding in wrangler.jsonc. Without the binding (local,
// CI) nothing is limited.

const FORM_RATE_LIMITER = "FORM_RATE_LIMITER";

type RateLimiter = { limit: (options: { key: string }) => Promise<{ success: boolean }> };

/** Fails open if the limiter itself errors: the Turnstile check still runs after it. */
export async function isOverFormLimit(visitorKey: string | null): Promise<boolean> {
  const limiter = getCloudflareBinding<RateLimiter>(FORM_RATE_LIMITER);
  if (!limiter || !visitorKey) return false;
  try {
    const { success } = await limiter.limit({ key: `form:${visitorKey}` });
    return !success;
  } catch (error) {
    console.error(JSON.stringify({ message: "Form rate limiter unavailable", error: String(error) }));
    return false;
  }
}

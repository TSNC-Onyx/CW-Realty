import "server-only";

import { getCloudflareBinding } from "@/lib/platform/cloudflare-bindings";

// Per-visitor limits on public endpoints (Infra §2 "rate limit all public endpoints"),
// using the Workers Rate Limiting bindings in wrangler.jsonc. Without a binding (local,
// CI) nothing is limited.

const FORM_RATE_LIMITER = "FORM_RATE_LIMITER";
const CHAT_RATE_LIMITER = "CHAT_RATE_LIMITER";

type RateLimiter = { limit: (options: { key: string }) => Promise<{ success: boolean }> };

type LimitCheck = { bindingName: string; keyPrefix: string; visitorKey: string | null };

/** Fails open if the limiter itself errors: the Turnstile check still protects the endpoint. */
async function isOverLimit({ bindingName, keyPrefix, visitorKey }: LimitCheck): Promise<boolean> {
  const limiter = getCloudflareBinding<RateLimiter>(bindingName);
  if (!limiter || !visitorKey) return false;
  try {
    const { success } = await limiter.limit({ key: `${keyPrefix}:${visitorKey}` });
    return !success;
  } catch (error) {
    console.error(JSON.stringify({ message: "Rate limiter unavailable", bindingName, error: String(error) }));
    return false;
  }
}

export async function isOverFormLimit(visitorKey: string | null): Promise<boolean> {
  return isOverLimit({ bindingName: FORM_RATE_LIMITER, keyPrefix: "form", visitorKey });
}

export async function isOverChatLimit(visitorKey: string | null): Promise<boolean> {
  return isOverLimit({ bindingName: CHAT_RATE_LIMITER, keyPrefix: "chat", visitorKey });
}

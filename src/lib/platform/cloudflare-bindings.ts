import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

// Cloudflare bindings (queues, rate limiters) exist only on the real Workers runtime.
// Local servers can expose stand-ins that do nothing, so they are ignored there.

function isCloudflareWorkersRuntime(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

export function getCloudflareBinding<Binding>(name: string): Binding | null {
  if (!isCloudflareWorkersRuntime()) return null;
  try {
    const { env } = getCloudflareContext();
    return ((env as unknown as Record<string, Binding | undefined>)[name]) ?? null;
  } catch {
    return null;
  }
}

import "server-only";

import { headers } from "next/headers";

// Who is calling a public endpoint: the connecting IP (for rate limits and the bot check)
// and the host name the page was served from (the bot check must match it).

export type Visitor = { ip: string | null; hostname: string | null };

export async function fetchVisitor(): Promise<Visitor> {
  const headerStore = await headers();
  const ip = headerStore.get("cf-connecting-ip") ?? headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const hostname = (headerStore.get("host") ?? "").split(":")[0] || null;
  return { ip, hostname };
}

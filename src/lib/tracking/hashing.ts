// Email and phone are only ever shared with Google and Meta as SHA-256 hashes, each prepared
// the way that platform documents so its match works (Google Enhanced Conversions guide;
// Meta Conversions API customer information parameters).

const GOOGLE_DOT_INSENSITIVE_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

export type HashedContact = { emailHash: string | null; phoneHash: string | null };

export async function getSha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Google: trim and lowercase; for Gmail addresses also drop dots and any "+tag". */
export function getGoogleNormalizedEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const [localPart = "", domain = ""] = normalized.split("@");
  if (!GOOGLE_DOT_INSENSITIVE_DOMAINS.has(domain)) return normalized;
  return `${localPart.split("+")[0]?.replaceAll(".", "") ?? ""}@${domain}`;
}

/** Meta: trim and lowercase. */
export function getMetaNormalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Meta wants digits only, country code included. */
export function getMetaNormalizedPhone(e164Phone: string): string {
  return e164Phone.replace(/\D/g, "");
}

async function getOptionalHash(value: string | null): Promise<string | null> {
  return value ? getSha256Hex(value) : null;
}

// Google wants phones in E.164 with the plus sign, which is how the site stores them.
export async function getGoogleHashedContact({ email, phone }: { email: string | null; phone: string | null }): Promise<HashedContact> {
  const [emailHash, phoneHash] = await Promise.all([
    getOptionalHash(email ? getGoogleNormalizedEmail(email) : null),
    getOptionalHash(phone),
  ]);
  return { emailHash, phoneHash };
}

export async function getMetaHashedContact({ email, phone }: { email: string | null; phone: string | null }): Promise<HashedContact> {
  const [emailHash, phoneHash] = await Promise.all([
    getOptionalHash(email ? getMetaNormalizedEmail(email) : null),
    getOptionalHash(phone ? getMetaNormalizedPhone(phone) : null),
  ]);
  return { emailHash, phoneHash };
}

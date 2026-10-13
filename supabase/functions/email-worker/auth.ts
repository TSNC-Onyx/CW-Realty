// Checks the wake-up call's shared secret without leaking timing: both sides are hashed to a
// fixed length, then every byte is compared.

const BEARER_PREFIX = "Bearer ";

async function getDigest(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

export async function isSameSecret(given: string, expected: string): Promise<boolean> {
  const [givenDigest, expectedDigest] = await Promise.all([getDigest(given), getDigest(expected)]);
  let difference = 0;
  for (let index = 0; index < expectedDigest.length; index += 1) difference |= (givenDigest[index] ?? 0) ^ (expectedDigest[index] ?? 0);
  return difference === 0 && expected.length > 0;
}

export function getBearerToken(authorization: string | null): string {
  return authorization?.startsWith(BEARER_PREFIX) ? authorization.slice(BEARER_PREFIX.length) : "";
}

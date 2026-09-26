// The optional server-side tagging container (Features §3), set as the Worker variable
// TAG_SERVER_URL. Only an https address is accepted; anything else leaves it off.

/** The tag server's origin (for the security policy and the Tag Manager script), or null. */
export function getTagServerOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

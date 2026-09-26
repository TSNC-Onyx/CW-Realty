/** JSON from a cookie or form field the visitor controls: anything malformed becomes null. */
export function parseJsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

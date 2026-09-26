// Cookies that Google and Meta tags set on this site. When a visitor withdraws consent they
// are deleted (plan decision 14). Browser-only apart from the pure helpers.

// FPLC comes from server-side tagging; its partner FPID is set by the tag server as
// HttpOnly, so only the tag server can clear it (listed in the privacy policy).
const TRACKER_COOKIE_PATTERN = /^(_ga|_gid|_gat|_gcl|_fbp|_fbc|FPLC)/;

/** Cookie names in a document.cookie string that belong to ad or analytics tags. */
export function getTrackerCookieNames(cookieHeader: string): string[] {
  return cookieHeader
    .split(";")
    .map((pair) => pair.split("=")[0]?.trim() ?? "")
    .filter((name) => TRACKER_COOKIE_PATTERN.test(name));
}

/** Tags may set cookies on the host or any parent domain (e.g. .charliewardrealty.com). */
export function getCookieDomains(hostname: string): string[] {
  const labels = hostname.split(".");
  const parentDomains = labels.slice(1, -1).map((_label, index) => `.${labels.slice(index + 1).join(".")}`);
  return [hostname, `.${hostname}`, ...parentDomains];
}

export function deleteTrackerCookies(): void {
  const domains = getCookieDomains(window.location.hostname);
  getTrackerCookieNames(document.cookie).forEach((name) => {
    document.cookie = `${name}=; Path=/; Max-Age=0`;
    domains.forEach((domain) => {
      document.cookie = `${name}=; Path=/; Domain=${domain}; Max-Age=0`;
    });
  });
}

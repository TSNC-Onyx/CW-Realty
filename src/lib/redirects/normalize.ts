// URL normalization rules from navigation-reconciliation.md #7:
// http → https, bare domain → www, uppercase → lowercase, no trailing slash, /home → /.

const CANONICAL_HOST = "www.charliewardrealty.com";
const BARE_HOST = "charliewardrealty.com";
const HOME_ALIAS_PATH = "/home";
const FILE_EXTENSION = /\.[a-z0-9]+$/i;
const TRAILING_SLASHES = /\/+$/;

function isProductionHost(hostname: string): boolean {
  return hostname === CANONICAL_HOST || hostname === BARE_HOST;
}

function getNormalizedPath(pathname: string): string {
  if (FILE_EXTENSION.test(pathname)) return pathname;
  const lowercasePath = pathname.toLowerCase();
  const trimmedPath = lowercasePath.replace(TRAILING_SLASHES, "") || "/";
  return trimmedPath === HOME_ALIAS_PATH ? "/" : trimmedPath;
}

/** Returns a new URL with the canonical host, protocol, and path; the query string is kept. */
export function getNormalizedUrl(requestUrl: URL): URL {
  const normalizedUrl = new URL(requestUrl.href);
  normalizedUrl.pathname = getNormalizedPath(requestUrl.pathname);
  if (!isProductionHost(requestUrl.hostname)) return normalizedUrl;
  normalizedUrl.protocol = "https:";
  normalizedUrl.hostname = CANONICAL_HOST;
  normalizedUrl.port = "";
  return normalizedUrl;
}

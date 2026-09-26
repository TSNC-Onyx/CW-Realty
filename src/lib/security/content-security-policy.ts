export const CONTENT_SECURITY_POLICY_HEADER = "Content-Security-Policy";
export const NONCE_HEADER = "x-nonce";
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
// Google's documented hosts for Tag Manager, GA4 with ads features, and Google Ads, plus
// the Meta Pixel (Phase 6). Scripts still need the page nonce; these only let loaded tags
// send measurements (Google "Content Security Policy" guide for tags).
const TRACKER_IMAGE_SOURCES = [
  "https://www.googletagmanager.com",
  "https://*.google-analytics.com",
  "https://*.google.com",
  "https://*.g.doubleclick.net",
  "https://www.googleadservices.com",
  "https://pagead2.googlesyndication.com",
  "https://www.facebook.com",
];
const TRACKER_CONNECT_SOURCES = [
  ...TRACKER_IMAGE_SOURCES,
  "https://*.analytics.google.com",
  "https://ad.doubleclick.net",
  "https://connect.facebook.net",
];
const TRACKER_FRAME_SOURCES = ["https://www.googletagmanager.com", "https://td.doubleclick.net"];

export type ContentSecurityPolicyOptions = {
  nonce: string;
  isDevelopment: boolean;
  supabaseOrigin?: string;
  // Admin pages only: the photo encoder runs WebAssembly (Phase 3 plan, decision 5).
  allowWebAssembly?: boolean;
  // Public pages only: consented analytics and ad tags (Phase 6), and the owner's optional
  // server-side tagging address.
  allowTrackers?: boolean;
  tagServerOrigin?: string | null;
};

function getScriptSources({ nonce, isDevelopment, allowWebAssembly }: ContentSecurityPolicyOptions): string {
  const developmentSources = isDevelopment ? " 'unsafe-eval'" : "";
  const webAssemblySources = allowWebAssembly ? " 'wasm-unsafe-eval'" : "";
  return `'self' 'nonce-${nonce}' 'strict-dynamic'${developmentSources}${webAssemblySources}`;
}

function getStyleSources({ nonce, isDevelopment }: ContentSecurityPolicyOptions): string {
  if (isDevelopment) return "'self' 'unsafe-inline'";
  return `'self' 'nonce-${nonce}'`;
}

function getOptionalOrigin(origin: string | null | undefined): string {
  return origin ? ` ${origin}` : "";
}

function getTrackerSources(options: ContentSecurityPolicyOptions, sources: string[]): string {
  if (!options.allowTrackers) return "";
  return ` ${sources.join(" ")}${getOptionalOrigin(options.tagServerOrigin)}`;
}

export function getContentSecurityPolicy(options: ContentSecurityPolicyOptions): string {
  const supabaseSource = getOptionalOrigin(options.supabaseOrigin);
  const directives = [
    "default-src 'self'",
    `script-src ${getScriptSources(options)}`,
    `style-src ${getStyleSources(options)}`,
    `img-src 'self' blob: data:${supabaseSource}${getTrackerSources(options, TRACKER_IMAGE_SOURCES)}`,
    "font-src 'self'",
    `connect-src 'self'${supabaseSource}${getTrackerSources(options, TRACKER_CONNECT_SOURCES)}`,
    "worker-src 'self'",
    // Cloudflare Turnstile (bot check on forms) runs in a frame from this host.
    `frame-src ${TURNSTILE_ORIGIN}${getTrackerSources(options, TRACKER_FRAME_SOURCES)}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (!options.isDevelopment) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function createNonce(): string {
  return btoa(crypto.randomUUID());
}

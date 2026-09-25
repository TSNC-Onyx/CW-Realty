export const CONTENT_SECURITY_POLICY_HEADER = "Content-Security-Policy";
export const NONCE_HEADER = "x-nonce";
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

export type ContentSecurityPolicyOptions = {
  nonce: string;
  isDevelopment: boolean;
  supabaseOrigin?: string;
  // Admin pages only: the photo encoder runs WebAssembly (Phase 3 plan, decision 5).
  allowWebAssembly?: boolean;
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

function getOptionalOrigin(origin: string | undefined): string {
  return origin ? ` ${origin}` : "";
}

export function getContentSecurityPolicy(options: ContentSecurityPolicyOptions): string {
  const supabaseSource = getOptionalOrigin(options.supabaseOrigin);
  const directives = [
    "default-src 'self'",
    `script-src ${getScriptSources(options)}`,
    `style-src ${getStyleSources(options)}`,
    `img-src 'self' blob: data:${supabaseSource}`,
    "font-src 'self'",
    `connect-src 'self'${supabaseSource}`,
    "worker-src 'self'",
    // Cloudflare Turnstile (bot check on forms) runs in a frame from this host.
    `frame-src ${TURNSTILE_ORIGIN}`,
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

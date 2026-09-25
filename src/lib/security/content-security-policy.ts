export const CONTENT_SECURITY_POLICY_HEADER = "Content-Security-Policy";
export const NONCE_HEADER = "x-nonce";

export type ContentSecurityPolicyOptions = {
  nonce: string;
  isDevelopment: boolean;
  supabaseOrigin?: string;
};

function getScriptSources({ nonce, isDevelopment }: ContentSecurityPolicyOptions): string {
  const developmentSources = isDevelopment ? " 'unsafe-eval'" : "";
  return `'self' 'nonce-${nonce}' 'strict-dynamic'${developmentSources}`;
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
    "frame-src 'none'",
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

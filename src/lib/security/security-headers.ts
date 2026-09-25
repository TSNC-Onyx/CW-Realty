const TWO_YEARS_IN_SECONDS = 63_072_000;

export type SecurityHeader = { key: string; value: string };

export const SECURITY_HEADERS: SecurityHeader[] = [
  { key: "Strict-Transport-Security", value: `max-age=${TWO_YEARS_IN_SECONDS}; includeSubDomains` },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

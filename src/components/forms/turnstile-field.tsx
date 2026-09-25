"use client";

import { Turnstile } from "@marsidev/react-turnstile";

// Cloudflare Turnstile bot check. It usually passes invisibly and only asks for a click
// when something looks automated. Its token lands in the form as "cf-turnstile-response".

type TurnstileFieldProps = { action: string; resetKey: string };

export function TurnstileField({ action, resetKey }: TurnstileFieldProps) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!siteKey) return null;
  return <Turnstile key={resetKey} siteKey={siteKey} options={{ action, size: "flexible", theme: "light", appearance: "interaction-only" }} />;
}

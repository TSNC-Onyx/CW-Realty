// Site values the emails need. The email-worker runs on Supabase (Deno) and can't import the
// website's code, so these are repeated here; site-values.test.ts fails if any one drifts from
// src/lib/site (navigation.ts, reply-promise.ts, phone.ts).

export const SITE_URL = "https://www.charliewardrealty.com";

// How soon visitors are told to expect an answer (Features §2).
export const REPLY_PROMISE = "within one business day";

const E164_US_NUMBER = /^\+1([0-9]{3})([0-9]{3})([0-9]{4})$/;

export type E164Phone = `+1${string}`;

/** "+13367080560" → "(336) 708-0560" */
export function getDisplayPhone(phone: E164Phone): string {
  const match = E164_US_NUMBER.exec(phone);
  if (!match) return phone;
  const [, areaCode, exchange, line] = match;
  return `(${areaCode}) ${exchange}-${line}`;
}

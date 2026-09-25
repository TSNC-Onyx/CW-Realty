// US phone numbers are stored as E.164 (+13365550123), matching the database checks.

const US_COUNTRY_CODE = "1";
const US_NATIONAL_NUMBER = /^[2-9][0-9]{9}$/;
const E164_US_NUMBER = /^\+1([0-9]{3})([0-9]{3})([0-9]{4})$/;

export type E164Phone = `+1${string}`;

function getNationalDigits(input: string): string {
  const digits = input.replace(/\D/g, "");
  const hasCountryCode = digits.length === 11 && digits.startsWith(US_COUNTRY_CODE);
  return hasCountryCode ? digits.slice(1) : digits;
}

/** Returns the E.164 form of a typed US number, or null when it is not a valid US number. */
export function getE164Phone(input: string): E164Phone | null {
  const nationalDigits = getNationalDigits(input);
  if (!US_NATIONAL_NUMBER.test(nationalDigits)) return null;
  return `+1${nationalDigits}`;
}

/** "+13367080560" → "(336) 708-0560" */
export function getDisplayPhone(phone: E164Phone): string {
  const match = E164_US_NUMBER.exec(phone);
  if (!match) return phone;
  const [, areaCode, exchange, line] = match;
  return `(${areaCode}) ${exchange}-${line}`;
}

export function getCallHref(phone: E164Phone): string {
  return `tel:${phone}`;
}

export function getTextHref(phone: E164Phone): string {
  return `sms:${phone}`;
}

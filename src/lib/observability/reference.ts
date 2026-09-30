// Reference codes people can read out ("CWR-7F3-K2Q"), derived from the problem's id.
// Crockford base32: no I, L, O, or U, so codes survive being typed or said aloud.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 6;
const GROUP_LENGTH = 3;
const GROUP_COUNT = CODE_LENGTH / GROUP_LENGTH;
const BITS_PER_CHARACTER = 5n;
const CHARACTER_MASK = 31n;
// 6 characters × 5 bits = 30 bits, taken from the first 8 hex digits of the id. Short codes
// can repeat; the database gives a new problem a fresh code when its code is already taken.
const ID_HEX_DIGITS = 8;

export function getReference(problemId: string): string {
  let value = BigInt(`0x${problemId.replace(/-/g, "").slice(0, ID_HEX_DIGITS)}`);
  const characters: string[] = [];
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    characters.unshift(ALPHABET.charAt(Number(value & CHARACTER_MASK)));
    value >>= BITS_PER_CHARACTER;
  }
  const groups = Array.from({ length: GROUP_COUNT }, (_unused, group) => group).map((group) => characters.slice(group * GROUP_LENGTH, (group + 1) * GROUP_LENGTH).join(""));
  return `CWR-${groups.join("-")}`;
}

export function getReferenceSuffix({ reference, isStored }: { reference: string; isStored: boolean }): string {
  return isStored ? ` (Ref ${reference})` : ` (Ref ${reference} — may not be saved)`;
}

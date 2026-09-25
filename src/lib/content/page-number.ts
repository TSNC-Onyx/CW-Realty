// Reads ?page= for paginated lists. Missing → page 1; anything that is not a
// whole number from 1 to 9999 → null (the page answers 404).

const PAGE_NUMBER = /^[1-9][0-9]{0,3}$/;

export function getPageNumber(rawPage: string | string[] | undefined): number | null {
  if (rawPage === undefined) return 1;
  if (typeof rawPage !== "string" || !PAGE_NUMBER.test(rawPage)) return null;
  return Number(rawPage);
}

export function getTotalPages(totalCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}

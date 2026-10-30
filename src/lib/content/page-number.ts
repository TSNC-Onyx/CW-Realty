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

/** The canonical address of one page of a list: page 1 is the bare list; a page that doesn't exist has none. */
export function getPageCanonical({ basePath, page, totalPages }: { basePath: string; page: number | null; totalPages: number }): string | null {
  if (page === null || page > totalPages) return null;
  return page === 1 ? basePath : `${basePath}?page=${page}`;
}

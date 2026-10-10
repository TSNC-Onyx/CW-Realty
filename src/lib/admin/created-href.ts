// Where an Add page goes once the new record is saved and its files are uploaded
// (docs/admin-upload-layout-plan.md). "missed" counts files that didn't upload, so the
// Edit page can say what is left to add.

const MISSED_PATTERN = /^[1-9]\d{0,2}$/;

type CreatedHrefOptions = { editPath: string; recordId: string; missedCount: number };

export function getCreatedHref({ editPath, recordId, missedCount }: CreatedHrefOptions): string {
  const href = `${editPath}/${recordId}?created=1`;
  return missedCount > 0 ? `${href}&missed=${missedCount}` : href;
}

/** The "missed" search parameter as a count; anything that isn't a small positive whole number is 0. */
export function getMissedCount(missed: string | undefined): number {
  if (!missed || !MISSED_PATTERN.test(missed)) return 0;
  return Number(missed);
}

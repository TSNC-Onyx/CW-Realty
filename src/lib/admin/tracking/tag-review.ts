// Features §4 "review tags quarterly": a review older than 90 days (or none yet) is due.

const TAG_REVIEW_INTERVAL_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isTagReviewDue({ reviewedAt, now }: { reviewedAt: string | null; now: Date }): boolean {
  if (!reviewedAt) return true;
  return now.getTime() - new Date(reviewedAt).getTime() > TAG_REVIEW_INTERVAL_DAYS * DAY_MS;
}

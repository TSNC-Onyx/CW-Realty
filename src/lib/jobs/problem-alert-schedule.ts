// Problem-alert emails are paused (owner decision 2026-09-30): the Cloudflare account's
// Workers Free plan allows 5 Cron Triggers and all are in use, so the 5-minute sender in
// worker.ts has no schedule (wrangler.jsonc "triggers"). Problems are still recorded.
// To resume: give the Worker its "*/5 * * * *" Cron Trigger again and set this to false.
export const ARE_PROBLEM_EMAILS_PAUSED = true;

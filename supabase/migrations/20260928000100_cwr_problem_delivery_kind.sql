-- Problem-alert digests are a new kind of email in the delivery log
-- (docs/cwr-error-tracking-plan.md). Postgres refuses to use a new enum value in the
-- transaction that adds it, so this runs on its own before the problem-tracking migration.

alter type cwr.delivery_kind add value if not exists 'problem';

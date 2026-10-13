-- Account emails (invite, reset, account notices) become a kind in the delivery log
-- (docs/cwr-email-outbox-plan.md). Postgres refuses to use a new enum value in the
-- transaction that adds it, so this runs on its own before the outbox migration.

alter type cwr.delivery_kind add value if not exists 'account';

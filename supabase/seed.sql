-- Local and CI only (runs after migrations on `supabase start` and `supabase db reset`).
-- The email outbox is live locally, so new requests, replies, test alerts and sign-in emails go
-- through the email-worker to Mailpit, the local test inbox (docs/cwr-email-outbox-plan.md).
-- The live project is switched over by hand at rollout step 2 (docs/runbooks/email-outbox.md).

update cwr.email_settings
set is_outbox_live = true,
    worker_url = 'http://supabase_kong_cw-realty:8000/functions/v1/email-worker'
where tenant_id = cwr.get_default_tenant_id();

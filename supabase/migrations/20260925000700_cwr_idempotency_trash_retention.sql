-- Retry-safe mutations, the 30-day trash, and scheduled retention jobs (Infra §3, §4).

-- ---------------------------------------------------------------------------
-- Idempotency keys: the server records each mutation's key and result so a
-- retried request returns the first result instead of repeating the work.
-- ---------------------------------------------------------------------------

create table cwr.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references cwr.tenants (id) on delete cascade,
  scope text not null check (scope ~ '^[a-z_.]+$'),
  key text not null check (length(key) between 8 and 200),
  request_hash text not null,
  response jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  unique (tenant_id, scope, key)
);

create index idempotency_keys_expires_at_idx on cwr.idempotency_keys (expires_at);

-- Server-only table: RLS on with no policies, so browser roles cannot reach it.
alter table cwr.idempotency_keys enable row level security;
grant all on cwr.idempotency_keys to service_role;

-- ---------------------------------------------------------------------------
-- Trash: everything soft-deleted in the last 30 days. SECURITY INVOKER, so each
-- viewer sees only rows their own policies allow.
-- ---------------------------------------------------------------------------

create view cwr.trash
with (security_invoker = true)
as
  select 'listings'::text as item_type, id, tenant_id, street_address as label,
         deleted_at, deleted_at + interval '30 days' as purge_after
  from cwr.listings where deleted_at is not null
  union all
  select 'listing_photos', id, tenant_id, alt_text,
         deleted_at, deleted_at + interval '30 days'
  from cwr.listing_photos where deleted_at is not null
  union all
  select 'team_members', id, tenant_id, full_name,
         deleted_at, deleted_at + interval '30 days'
  from cwr.team_members where deleted_at is not null;

grant select on cwr.trash to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Retention jobs. Each runs as the database owner from pg_cron.
-- ---------------------------------------------------------------------------

create function cwr.purge_trash()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from cwr.listing_photos where deleted_at < now() - interval '30 days';
  delete from cwr.listings where deleted_at < now() - interval '30 days';
  delete from cwr.team_members where deleted_at < now() - interval '30 days';
$$;

create function cwr.purge_closed_conversations()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from cwr.chat_sessions
  where coalesce(ended_at, last_message_at) < now() - interval '1 year';
  delete from cwr.inbox_threads
  where status = 'closed' and closed_at < now() - interval '1 year';
$$;

create function cwr.purge_expired_idempotency_keys()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from cwr.idempotency_keys where expires_at < now();
$$;

create function cwr.purge_expired_audit_log()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('cwr.retention_purge', 'on', true);
  delete from cwr.audit_log where created_at < now() - interval '3 years';
  perform set_config('cwr.retention_purge', 'off', true);
end;
$$;

-- pg_cron is already installed on the hosted project; this is a no-op there.
-- Jobs are created by name, so the project's existing (legacy) job is untouched.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('cwr_purge_trash', '10 3 * * *', 'select cwr.purge_trash()');
select cron.schedule('cwr_purge_closed_conversations', '20 3 * * *', 'select cwr.purge_closed_conversations()');
select cron.schedule('cwr_purge_idempotency_keys', '30 * * * *', 'select cwr.purge_expired_idempotency_keys()');
select cron.schedule('cwr_purge_audit_log', '40 3 * * 0', 'select cwr.purge_expired_audit_log()');

-- Inbox intake and alert delivery log (Phase 4; Admin §5, Infra §3).
-- Expand-only: two new types, one new table, one new function, and the one-year
-- retention job now also clears old test-alert deliveries.

-- ---------------------------------------------------------------------------
-- Delivery log: one row per email the site tries to send, so failures are visible
-- and can be retried from the admin portal (Infra §3 dead-letter visibility).
-- ---------------------------------------------------------------------------

create type cwr.delivery_kind as enum ('new_request', 'visitor_copy', 'reply', 'test');
-- 'sending' is a short claim so two workers (or a Retry click) never send the same email.
create type cwr.delivery_status as enum ('pending', 'sending', 'sent', 'failed', 'not_sent');

create table cwr.alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references cwr.tenants (id) on delete cascade,
  kind cwr.delivery_kind not null,
  thread_id uuid,
  message_id uuid references cwr.inbox_messages (id) on delete cascade,
  -- Groups the rows of one "Send test alert" click, so a retried test never re-sends.
  job_run_id uuid,
  recipient_email text not null check (recipient_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  status cwr.delivery_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  provider_message_id text check (length(provider_message_id) <= 200),
  last_error text check (length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (thread_id, tenant_id) references cwr.inbox_threads (id, tenant_id) on delete cascade,
  check (kind = 'test' or thread_id is not null),
  check ((kind = 'test') = (job_run_id is not null))
);

create index alert_deliveries_tenant_created_idx on cwr.alert_deliveries (tenant_id, created_at desc);
create index alert_deliveries_thread_idx on cwr.alert_deliveries (thread_id) where thread_id is not null;
create index alert_deliveries_failed_idx on cwr.alert_deliveries (tenant_id, status) where status = 'failed';
-- One delivery per request, recipient, and kind, so a retried job never emails twice.
create unique index alert_deliveries_request_recipient_key
  on cwr.alert_deliveries (thread_id, kind, lower(recipient_email)) where kind in ('new_request', 'visitor_copy');
create unique index alert_deliveries_reply_recipient_key
  on cwr.alert_deliveries (message_id, lower(recipient_email)) where kind = 'reply';
create unique index alert_deliveries_test_recipient_key
  on cwr.alert_deliveries (job_run_id, lower(recipient_email)) where kind = 'test';
create index alert_deliveries_visitor_copy_recent_idx
  on cwr.alert_deliveries (lower(recipient_email), created_at) where kind = 'visitor_copy';

create trigger alert_deliveries_set_updated_at
  before update on cwr.alert_deliveries
  for each row execute function cwr.set_updated_at();

-- Email addresses and provider errors stay out of the long-lived audit log.
create trigger alert_deliveries_record_audit
  after insert or update or delete on cwr.alert_deliveries
  for each row execute function cwr.record_audit('recipient_email', 'last_error');

alter table cwr.alert_deliveries enable row level security;

create policy "Editors read the delivery log"
  on cwr.alert_deliveries for select
  to authenticated
  using (tenant_id in (select cwr.editor_tenant_ids()));

-- Deliveries are written only by the server's job runner (service role).
grant select on cwr.alert_deliveries to authenticated;
grant all on cwr.alert_deliveries to service_role;

-- ---------------------------------------------------------------------------
-- Intake: a public form's request becomes a thread and its first message in one
-- transaction. Called only by the server after its bot check (service role).
-- ---------------------------------------------------------------------------

create function cwr.create_inbox_thread(
  p_tenant_slug text,
  p_source cwr.inbox_source,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_subject text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_thread_id uuid;
begin
  select t.id into v_tenant_id from cwr.tenants t where t.slug = p_tenant_slug;
  if v_tenant_id is null then
    raise exception 'Unknown tenant' using errcode = 'no_data_found';
  end if;
  insert into cwr.inbox_threads (tenant_id, source, contact_name, contact_email, contact_phone, subject)
  values (v_tenant_id, p_source, p_contact_name, nullif(p_contact_email, ''), nullif(p_contact_phone, ''), coalesce(p_subject, ''))
  returning id into v_thread_id;
  insert into cwr.inbox_messages (tenant_id, thread_id, kind, body)
  values (v_tenant_id, v_thread_id, 'inbound', p_body);
  return v_thread_id;
end;
$$;

revoke execute on function cwr.create_inbox_thread(text, cwr.inbox_source, text, text, text, text, text) from public, anon, authenticated;
grant execute on function cwr.create_inbox_thread(text, cwr.inbox_source, text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Staff may change only a thread's status and assignee (and RLS keeps staff to their own
-- threads), never the visitor's contact details that replies are emailed to.
-- ---------------------------------------------------------------------------

revoke update on cwr.inbox_threads from authenticated;
-- closed_at stays listed because cwr.stamp_inbox_closed_at() already overrides any value sent.
grant update (status, assignee_id, closed_at) on cwr.inbox_threads to authenticated;

-- ---------------------------------------------------------------------------
-- Retention: deliveries for threads go with their thread (cascade); test alerts
-- are kept one year, like closed conversations.
-- ---------------------------------------------------------------------------

create or replace function cwr.purge_closed_conversations()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from cwr.chat_sessions
  where coalesce(ended_at, last_message_at) < now() - interval '1 year';
  delete from cwr.inbox_threads
  where status = 'closed' and closed_at < now() - interval '1 year';
  delete from cwr.alert_deliveries
  where kind = 'test' and created_at < now() - interval '1 year';
$$;

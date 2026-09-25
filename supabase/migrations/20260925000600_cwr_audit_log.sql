-- Append-only audit log: who, what, when, tenant, before/after values (Infra §4).
-- Kept 3 years (NC Real Estate Commission record rule); purged only by the retention job.

create table cwr.audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  actor_id uuid,
  actor_role text not null,
  action text not null check (action in ('insert', 'update', 'delete', 'transition')),
  table_name text not null,
  record_id uuid,
  old_values jsonb,
  new_values jsonb,
  request_id text,
  created_at timestamptz not null default now()
);
-- No foreign keys on purpose: log rows must outlive the users and records they describe.

create index audit_log_tenant_created_idx on cwr.audit_log (tenant_id, created_at desc);
create index audit_log_record_idx on cwr.audit_log (table_name, record_id);
create index audit_log_created_at_brin on cwr.audit_log using brin (created_at);

-- Request ID sent by the app (x-request-id) so a log line can be traced end to end.
create function cwr.get_request_id()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-request-id';
$$;

create function cwr.get_audit_action()
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when current_setting('cwr.in_transition', true) = 'on' then 'transition'
    else 'update'
  end;
$$;

-- Trigger args (optional): column names whose values are left out of the log,
-- e.g. visitor contact details and message text, which have a shorter retention.
create function cwr.record_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_redacted_columns text[] := coalesce(tg_argv::text[], '{}');
begin
  insert into cwr.audit_log (
    tenant_id, actor_id, actor_role, action, table_name, record_id,
    old_values, new_values, request_id
  )
  values (
    case when tg_table_name = 'tenants' then (v_row ->> 'id')::uuid else (v_row ->> 'tenant_id')::uuid end,
    auth.uid(),
    coalesce(auth.jwt() ->> 'role', session_user),
    case when tg_op = 'UPDATE' then cwr.get_audit_action() else lower(tg_op) end,
    tg_table_name,
    (v_row ->> 'id')::uuid,
    case when tg_op <> 'INSERT' then to_jsonb(old) - v_redacted_columns end,
    case when tg_op <> 'DELETE' then to_jsonb(new) - v_redacted_columns end,
    cwr.get_request_id()
  );
  return null;
end;
$$;

-- Users can never change or remove history; only the retention job may delete.
create function cwr.prevent_audit_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('cwr.retention_purge', true) = 'on' then
    return old;
  end if;
  raise exception 'The audit log is append-only' using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_log_prevent_change
  before update or delete on cwr.audit_log
  for each row execute function cwr.prevent_audit_change();
create trigger audit_log_prevent_truncate
  before truncate on cwr.audit_log
  for each statement execute function cwr.prevent_audit_change();

-- Attach the audit trigger to every table. Columns listed per table are redacted.
do $$
declare
  v_table text;
  v_redactions constant jsonb := jsonb_build_object(
    'inbox_threads', array['contact_name', 'contact_email', 'contact_phone', 'subject'],
    'inbox_messages', array['body'],
    'chat_messages', array['body']
  );
begin
  foreach v_table in array array[
    'tenants', 'memberships', 'site_settings', 'listings', 'listing_photos', 'team_members',
    'redirects', 'inbox_threads', 'inbox_messages', 'notification_recipients',
    'chat_policies', 'chat_policy_tests', 'chat_policy_test_runs', 'chat_sessions',
    'chat_messages', 'workflows', 'workflow_transitions'
  ]
  loop
    execute format(
      'create trigger %I after insert or update or delete on cwr.%I
         for each row execute function cwr.record_audit(%s)',
      v_table || '_record_audit',
      v_table,
      coalesce(
        (select string_agg(quote_literal(c), ', ')
         from jsonb_array_elements_text(v_redactions -> v_table) c),
        ''
      )
    );
  end loop;
end;
$$;

alter table cwr.audit_log enable row level security;

create policy "Owners read their tenant's audit log"
  on cwr.audit_log for select
  to authenticated
  using (tenant_id in (select cwr.owner_tenant_ids()));

revoke all on cwr.audit_log from anon, authenticated, service_role;
grant select on cwr.audit_log to authenticated, service_role;

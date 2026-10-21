-- Forward problems to BuiltFor Ops (BuiltFor docs/client-alert-forwarding-plan.md, approved
-- 2026-10-21). Once a minute a database job sends each new error or critical problem to
-- BuiltFor's tenant-alert-receiver, so BuiltFor sees CW Realty's outages in its Ops inbox.
-- Expand-only: two new tables, new functions and one job. Nothing about how problems are
-- recorded, shown or emailed changes: the job only reads cwr.problem_events, outside the write.
-- Nothing is sent until the settings row exists with is_enabled = true and the Vault secret
-- builtfor_webhook_secret is set; rows recorded before forward_from are never sent.
-- Rollback: docs/runbooks/builtfor-forward-down.sql.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Settings (one row) and the outbox of problems to send
-- ---------------------------------------------------------------------------

create table cwr.builtfor_forward_settings (
  local_tenant_id uuid primary key references cwr.tenants (id) on delete cascade,
  -- This client's clients.tenant_id in BuiltFor, so Ops links the alert to CW Realty.
  builtfor_tenant_id uuid not null,
  builtfor_tenant_name text not null check (length(builtfor_tenant_name) <= 200),
  receiver_url text not null check (receiver_url ~ '^https?://[^\s]+$'),
  forward_from timestamptz not null default now(),
  is_enabled boolean not null default false
);
-- One row: the job forwards one tenant.
create unique index builtfor_forward_settings_one_row on cwr.builtfor_forward_settings ((true));

-- No foreign key to cwr.problem_events on purpose: cwr_purge_problems deletes old problems.
create table cwr.builtfor_forwards (
  source_id uuid primary key,
  status text not null default 'pending' check (status in ('pending', 'sent', 'dead')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  request_id bigint,
  requested_at timestamptz,
  last_status integer,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index builtfor_forwards_due_idx on cwr.builtfor_forwards (next_attempt_at) where status = 'pending';

alter table cwr.builtfor_forward_settings enable row level security;
alter table cwr.builtfor_forwards enable row level security;
revoke all on cwr.builtfor_forward_settings, cwr.builtfor_forwards from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Payload (the receiver's existing contract) and the result of one send
-- ---------------------------------------------------------------------------

create function cwr.builtfor_alert_payload(p_event cwr.problem_events, p_settings cwr.builtfor_forward_settings)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'source', 'problem_events',
    -- Hashed with a client prefix so a browser-supplied id can never match another sender's row.
    'sourceRowId', md5('cwr:' || p_event.id)::uuid,
    'tenantId', p_settings.builtfor_tenant_id,
    'tenantName', p_settings.builtfor_tenant_name,
    'severity', p_event.severity,
    'category', case when p_event.stage = 'auth' then 'auth_event' else 'service_error' end,
    'title', left(coalesce((select c.label from cwr.problem_catalog c where c.action = p_event.action), p_event.action)
      || ' — ' || coalesce(p_event.code, 'no code'), 200),
    'detail', 'Ref ' || p_event.reference || ' · ' || p_event.origin || ' · ' || p_event.stage
      || ' · release ' || coalesce(p_event.release, '?') || E'\n' || left(coalesce(p_event.detail, ''), 500),
    'component', p_event.area,
    'operation', p_event.action,
    'entityId', p_event.reference,
    'occurredAt', p_event.occurred_at,
    'dedupKey', p_event.fingerprint);
$$;

-- 2xx: sent. Anything else (or no answer): retry after least(2^attempts, 60) minutes, where
-- attempts counts the failures before this one, scaled by a random 0.5–1 so retries spread
-- out; a row still failing 24 hours after it was queued is given up on (dead).
create function cwr.builtfor_apply_response(p_source_id uuid, p_status integer, p_error text)
returns text
language sql
set search_path = ''
as $$
  update cwr.builtfor_forwards f
  set status = case
        when p_status between 200 and 299 then 'sent'
        when f.created_at < now() - interval '24 hours' then 'dead'
        else 'pending' end,
      sent_at = case when p_status between 200 and 299 then now() end,
      attempts = case when p_status between 200 and 299 then f.attempts else f.attempts + 1 end,
      next_attempt_at = case
        when p_status between 200 and 299 then f.next_attempt_at
        else now() + least(power(2, f.attempts), 60) * interval '1 minute' * (0.5 + random() / 2) end,
      request_id = null,
      last_status = p_status,
      last_error = left(p_error, 300)
  where f.source_id = p_source_id
  returning f.status;
$$;

-- ---------------------------------------------------------------------------
-- The steps of one run
-- ---------------------------------------------------------------------------

create function cwr.get_builtfor_webhook_secret()
returns text
language sql
stable
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'builtfor_webhook_secret';
$$;

-- Applies the answers pg_net has stored for sent requests; a request with no answer after
-- 15 minutes counts as failed. Returns how many rows were given up on.
create function cwr.reconcile_builtfor_forwards()
returns integer
language sql
set search_path = ''
as $$
  select count(*) filter (where o.status = 'dead')::integer
  from (
    select cwr.builtfor_apply_response(
      p_source_id => f.source_id,
      p_status => r.status_code,
      p_error => case when r.id is null then 'no response' else coalesce(r.error_msg, left(r.content, 300)) end) as status
    from cwr.builtfor_forwards f
    left join net._http_response r on r.id = f.request_id
    where f.status = 'pending' and f.request_id is not null
      and (r.id is not null or f.requested_at < now() - interval '15 minutes')
  ) o;
$$;

-- Not a cursor on purpose: problems are stamped with their transaction's start time, so a slow
-- write can commit after a later-stamped one; anything not yet queued in the last 7 days is
-- picked up.
create function cwr.enqueue_builtfor_forwards(p_settings cwr.builtfor_forward_settings)
returns void
language sql
set search_path = ''
as $$
  insert into cwr.builtfor_forwards (source_id)
  select e.id
  from cwr.problem_events e
  where e.tenant_id = p_settings.local_tenant_id
    and e.severity in ('error', 'critical')
    and e.occurred_at >= greatest(p_settings.forward_from, now() - interval '7 days')
    and not exists (select 1 from cwr.builtfor_forwards f where f.source_id = e.id)
  order by e.occurred_at
  limit 200
  on conflict do nothing;
$$;

create function cwr.send_builtfor_forwards(p_settings cwr.builtfor_forward_settings, p_secret text)
returns void
language sql
set search_path = ''
as $$
  with due as (
    select f.source_id, e as event
    from cwr.builtfor_forwards f
    join cwr.problem_events e on e.id = f.source_id
    where f.status = 'pending' and f.request_id is null and f.next_attempt_at <= now()
    order by e.occurred_at
    limit 50
  )
  update cwr.builtfor_forwards f
  set request_id = net.http_post(
        url := p_settings.receiver_url,
        body := cwr.builtfor_alert_payload(due.event, p_settings),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-builtfor-webhook-secret', p_secret),
        timeout_milliseconds := 15000),
      requested_at = now()
  from due
  where f.source_id = due.source_id;
$$;

create function cwr.purge_builtfor_forwards()
returns void
language sql
set search_path = ''
as $$
  delete from cwr.builtfor_forwards where status = 'sent' and sent_at < now() - interval '30 days';
$$;

-- Security definer on purpose: reading Vault and calling pg_net need rights only the owner has.
create function cwr.forward_builtfor_alerts()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings cwr.builtfor_forward_settings;
  v_secret text;
  v_dead integer;
begin
  -- A manual call while the job runs must not send the same rows twice.
  if not pg_try_advisory_xact_lock(hashtext('builtfor_forward')) then
    return;
  end if;
  select * into v_settings from cwr.builtfor_forward_settings where is_enabled;
  v_secret := cwr.get_builtfor_webhook_secret();
  if v_settings.local_tenant_id is null or v_secret is null then
    return;
  end if;

  v_dead := cwr.reconcile_builtfor_forwards();
  perform cwr.enqueue_builtfor_forwards(v_settings);
  perform cwr.send_builtfor_forwards(v_settings, v_secret);
  perform cwr.purge_builtfor_forwards();

  -- The only signal when the link to BuiltFor itself is broken; at most one per run.
  if v_dead > 0 then
    perform cwr.record_database_problem(v_settings.local_tenant_id, jsonb_build_object(
      'action', 'database.health_check', 'stage', 'external', 'code', 'builtfor_forward_dead',
      'detail', v_dead || ' alerts could not be delivered to BuiltFor Ops'));
  end if;
end;
$$;

revoke execute on function
  cwr.builtfor_alert_payload(cwr.problem_events, cwr.builtfor_forward_settings),
  cwr.builtfor_apply_response(uuid, integer, text),
  cwr.get_builtfor_webhook_secret(),
  cwr.reconcile_builtfor_forwards(),
  cwr.enqueue_builtfor_forwards(cwr.builtfor_forward_settings),
  cwr.send_builtfor_forwards(cwr.builtfor_forward_settings, text),
  cwr.purge_builtfor_forwards(),
  cwr.forward_builtfor_alerts()
from public, anon, authenticated;

-- The cwr_ prefix puts it under the failed-job watchdog (cwr.check_scheduled_job_runs).
select cron.schedule('cwr_forward_builtfor', '* * * * *', 'select cwr.forward_builtfor_alerts()');

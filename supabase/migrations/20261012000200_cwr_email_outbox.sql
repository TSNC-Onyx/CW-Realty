-- Email outbox (docs/cwr-email-outbox-plan.md, owner approved 2026-10-12).
-- Every email starts as one row in cwr.email_jobs. Adding a row wakes the email-worker
-- (Supabase Edge Function) through pg_net; a once-a-minute job wakes it again for anything
-- the instant wake-up missed. Supabase Auth's Send Email hook (cwr.handle_auth_email) adds
-- account emails, so Supabase's own mailer is not used once the hook is on.
-- Expand-only: new tables, functions, triggers and jobs; the delivery log and health checks
-- only gain new allowed values. Nothing changes until cwr.email_settings.is_outbox_live and
-- worker_url are set (rollout step 2) and the hook is turned on (step 3).

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Settings: the cutover switch, where to wake the worker, and how long sign-in links live.
-- ---------------------------------------------------------------------------

create table cwr.email_settings (
  tenant_id uuid primary key references cwr.tenants (id) on delete cascade,
  -- Off: the site sends through the Cloudflare Queue as before. On: new requests, replies,
  -- test alerts, Retry and problem digests go through the outbox.
  is_outbox_live boolean not null default false,
  -- The email-worker's address; null keeps the wake-up off.
  worker_url text check (worker_url ~ '^https?://[^\s]+$'),
  -- Supabase's sign-in link lifetime (mailer_otp_exp); the owner script reports the hosted value.
  link_lifetime_seconds integer not null default 3600 check (link_lifetime_seconds between 600 and 604800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into cwr.email_settings (tenant_id) select id from cwr.tenants on conflict do nothing;

create trigger email_settings_set_updated_at
  before update on cwr.email_settings
  for each row execute function cwr.set_updated_at();
create trigger email_settings_record_audit
  after insert or update or delete on cwr.email_settings
  for each row execute function cwr.record_audit();

-- Switching the outbox off pauses problem emails again: their sender's heartbeat row is removed
-- so the watchdog doesn't report the paused sender as broken (same as 20260930000100). The
-- sender's first run after switching back on creates it again.
create function cwr.forget_paused_problem_sender()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from cwr.health_checks where tenant_id = new.tenant_id and name = 'problem_alerts';
  return null;
end;
$$;

create trigger email_settings_forget_paused_problem_sender
  after update of is_outbox_live on cwr.email_settings
  for each row when (old.is_outbox_live and not new.is_outbox_live)
  execute function cwr.forget_paused_problem_sender();

alter table cwr.email_settings enable row level security;
create policy "Editors read email settings"
  on cwr.email_settings for select
  to authenticated
  using (tenant_id in (select cwr.editor_tenant_ids()));
grant select on cwr.email_settings to authenticated;
grant all on cwr.email_settings to service_role;

-- ---------------------------------------------------------------------------
-- The outbox: one row per event. No visitor text is stored here (the worker reads it from
-- the inbox), so the table has no audit trigger.
-- ---------------------------------------------------------------------------

create type cwr.email_job_kind as enum ('new_request', 'reply', 'test', 'retry', 'problem_digest', 'account');
create type cwr.email_job_status as enum ('pending', 'working', 'done', 'failed', 'not_sent');

create table cwr.email_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references cwr.tenants (id) on delete cascade,
  kind cwr.email_job_kind not null,
  thread_id uuid,
  message_id uuid,
  delivery_id uuid,
  run_id uuid,
  user_id uuid,
  action_type text check (action_type in (
    'signup', 'invite', 'magiclink', 'email', 'recovery', 'email_change', 'reauthentication',
    'password_changed_notification', 'email_changed_notification', 'phone_changed_notification',
    'identity_linked_notification', 'identity_unlinked_notification',
    'mfa_factor_enrolled_notification', 'mfa_factor_unenrolled_notification'
  )),
  recipient_email text check (recipient_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  new_email text check (length(new_email) <= 320),
  old_email text check (length(old_email) <= 320),
  status cwr.email_job_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  expires_at timestamptz,
  last_error text check (length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'new_request' or thread_id is not null),
  check (kind <> 'reply' or message_id is not null),
  check (kind <> 'test' or run_id is not null),
  check (kind <> 'retry' or delivery_id is not null),
  check (kind <> 'account' or (action_type is not null and recipient_email is not null and expires_at is not null))
);

create index email_jobs_due_idx on cwr.email_jobs (next_attempt_at) where status = 'pending';
create index email_jobs_working_idx on cwr.email_jobs (claimed_at) where status = 'working';
create index email_jobs_tenant_created_idx on cwr.email_jobs (tenant_id, created_at desc);
create index email_jobs_pending_account_idx on cwr.email_jobs (user_id, action_type) where status = 'pending' and kind = 'account';

create trigger email_jobs_set_updated_at
  before update on cwr.email_jobs
  for each row execute function cwr.set_updated_at();

alter table cwr.email_jobs enable row level security;
create policy "Editors read the email outbox"
  on cwr.email_jobs for select
  to authenticated
  using (tenant_id in (select cwr.editor_tenant_ids()));
grant select on cwr.email_jobs to authenticated;
grant all on cwr.email_jobs to service_role;

-- ---------------------------------------------------------------------------
-- One-time link values (invite and reset only) live outside the Data API's reach. Only the
-- worker's claim function returns them; they are deleted as soon as the job is finished.
-- ---------------------------------------------------------------------------

create schema cwr_private;
revoke all on schema cwr_private from public;

create table cwr_private.email_job_secrets (
  job_id uuid primary key references cwr.email_jobs (id) on delete cascade,
  token_hash text not null check (length(token_hash) between 1 and 200),
  created_at timestamptz not null default now()
);

revoke all on cwr_private.email_job_secrets from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Waking the worker. The shared secret is made here, kept in Vault, and read back by the
-- worker through cwr.get_email_worker_secret (service role only).
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cwr_email_worker_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'cwr_email_worker_secret',
      'Sent by the database when it wakes the email-worker (docs/cwr-email-outbox-plan.md)'
    );
  end if;
end;
$$;

create function cwr.get_email_worker_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'cwr_email_worker_secret';
$$;

-- Security definer on purpose: reading Vault and calling pg_net need rights the callers
-- (the Auth hook role, the cron job, triggers) don't have.
create function cwr.post_email_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select worker_url into v_url from cwr.email_settings where tenant_id = cwr.get_default_tenant_id();
  v_secret := cwr.get_email_worker_secret();
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 5000
  );
end;
$$;

create function cwr.wake_email_worker_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform cwr.post_email_worker();
  return null;
end;
$$;

-- One wake-up per insert statement, however many rows it adds. pg_net sends it only after
-- the transaction commits, so it never slows the insert.
create trigger email_jobs_wake_worker
  after insert on cwr.email_jobs
  for each statement execute function cwr.wake_email_worker_after_insert();

-- ---------------------------------------------------------------------------
-- Adding jobs.
-- ---------------------------------------------------------------------------

create function cwr.is_email_outbox_live(p_tenant_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_outbox_live from cwr.email_settings where tenant_id = coalesce(p_tenant_id, cwr.get_default_tenant_id())), false);
$$;

-- For the admin pages: false only when the email-worker's last word was "not set up".
create function cwr.is_email_sending_ready(p_tenant_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select last_error_at is null or last_ok_at >= last_error_at
    from cwr.health_checks
    where tenant_id = coalesce(p_tenant_id, cwr.get_default_tenant_id()) and name = 'email_sending'
  ), true);
$$;

/** The site's own jobs: test alerts and Retry. Requests and replies are added by triggers. */
create function cwr.enqueue_email_job(p_kind cwr.email_job_kind, p_tenant_id uuid default null, p_run_id uuid default null, p_delivery_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
begin
  if p_kind not in ('test', 'retry') then
    raise exception 'Only test and retry jobs are added by the site' using errcode = '22023';
  end if;
  insert into cwr.email_jobs (tenant_id, kind, run_id, delivery_id)
  values (
    coalesce(p_tenant_id, (select tenant_id from cwr.alert_deliveries where id = p_delivery_id), cwr.get_default_tenant_id()),
    p_kind, p_run_id, p_delivery_id
  )
  returning id into v_job_id;
  return v_job_id;
end;
$$;

-- A request or reply and its email job are saved in the same transaction, so one can never
-- exist without the other (the outbox rule). Off until the cutover switch is on.
create function cwr.queue_inbox_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not cwr.is_email_outbox_live(new.tenant_id) then
    return null;
  end if;
  if tg_table_name = 'inbox_threads' then
    insert into cwr.email_jobs (tenant_id, kind, thread_id) values (new.tenant_id, 'new_request', new.id);
  else
    insert into cwr.email_jobs (tenant_id, kind, message_id) values (new.tenant_id, 'reply', new.id);
  end if;
  return null;
end;
$$;

create trigger inbox_threads_queue_email
  after insert on cwr.inbox_threads
  for each row execute function cwr.queue_inbox_email();
create trigger inbox_messages_queue_email
  after insert on cwr.inbox_messages
  for each row when (new.kind = 'reply') execute function cwr.queue_inbox_email();

-- Every 5 minutes: one problem-digest job per tenant, unless one is already waiting.
create function cwr.queue_problem_digest()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into cwr.email_jobs (tenant_id, kind)
  select s.tenant_id, 'problem_digest'
  from cwr.email_settings s
  where s.is_outbox_live
    and not exists (
      select 1 from cwr.email_jobs j
      where j.tenant_id = s.tenant_id and j.kind = 'problem_digest' and j.status in ('pending', 'working')
    );
$$;

-- ---------------------------------------------------------------------------
-- Supabase Auth's Send Email hook (Postgres function). It only adds rows — no network — so it
-- stays far inside the hook's 2-second limit. An error is returned in Supabase's hook format,
-- and Supabase then shows the person a plain error (the sign-in pages record those).
-- ---------------------------------------------------------------------------

create function cwr.handle_auth_email(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user jsonb := event -> 'user';
  v_data jsonb := event -> 'email_data';
  v_action text := v_data ->> 'email_action_type';
  v_tenant_id uuid := cwr.get_default_tenant_id();
  v_user_id uuid := nullif(v_user ->> 'id', '')::uuid;
  v_email text := lower(nullif(v_user ->> 'email', ''));
  v_new_email text := lower(nullif(v_user ->> 'new_email', ''));
  v_has_link boolean := v_action in ('invite', 'recovery');
  v_lifetime_seconds integer;
  v_expires_at timestamptz;
  v_job_id uuid;
begin
  select link_lifetime_seconds into v_lifetime_seconds from cwr.email_settings where tenant_id = v_tenant_id;
  -- A link is never sent in its last 5 minutes; emails without a link may wait up to a day.
  v_expires_at := case when v_has_link then now() + make_interval(secs => coalesce(v_lifetime_seconds, 3600) - 300) else now() + interval '1 day' end;

  -- Supabase has already cancelled the older link of the same kind for this person.
  if v_has_link then
    update cwr.email_jobs set status = 'not_sent', last_error = 'Superseded by a newer link'
    where kind = 'account' and user_id = v_user_id and action_type = v_action and status = 'pending';
    delete from cwr_private.email_job_secrets s using cwr.email_jobs j
    where s.job_id = j.id and j.user_id = v_user_id and j.action_type = v_action and j.status = 'not_sent';
  end if;

  -- Email change carries no link (the site doesn't offer it), so both addresses just hear about it.
  if v_action = 'email_change' then
    insert into cwr.email_jobs (tenant_id, kind, user_id, action_type, recipient_email, new_email, expires_at)
    select v_tenant_id, 'account', v_user_id, v_action, recipient, v_new_email, v_expires_at
    from (select distinct unnest(array[v_email, v_new_email]) as recipient) r
    where recipient is not null;
    return '{}'::jsonb;
  end if;

  insert into cwr.email_jobs (tenant_id, kind, user_id, action_type, recipient_email, new_email, old_email, expires_at)
  values (v_tenant_id, 'account', v_user_id, v_action, v_email, v_new_email, lower(nullif(v_data ->> 'old_email', '')), v_expires_at)
  returning id into v_job_id;
  if v_has_link then
    insert into cwr_private.email_job_secrets (job_id, token_hash) values (v_job_id, v_data ->> 'token_hash');
  end if;
  return '{}'::jsonb;
exception when others then
  return jsonb_build_object('error', jsonb_build_object('http_code', 500, 'message', 'The email could not be queued. Try again in a moment.'));
end;
$$;

grant usage on schema cwr to supabase_auth_admin;
grant execute on function cwr.handle_auth_email(jsonb) to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- The worker's side: claim due jobs, then report how each went. The database decides
-- retries: 1, 5, 15 and 60 minutes, then "failed" after the 5th try.
-- ---------------------------------------------------------------------------

create function cwr.claim_email_jobs(p_limit integer default 10)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed jsonb;
begin
  with expired as (
    update cwr.email_jobs set status = 'not_sent', last_error = 'The link expired before it could be sent; the person can ask again.'
    where kind = 'account' and expires_at <= now()
      and (status = 'pending' or (status = 'working' and claimed_at < now() - interval '10 minutes'))
    returning id
  )
  delete from cwr_private.email_job_secrets where job_id in (select id from expired);

  with due as (
    select id from cwr.email_jobs
    where (status = 'pending' and next_attempt_at <= now())
       or (status = 'working' and claimed_at < now() - interval '10 minutes')
    order by next_attempt_at
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  ),
  claimed as (
    update cwr.email_jobs j set status = 'working', claimed_at = now(), attempts = j.attempts + 1
    from due where j.id = due.id
    returning j.*
  )
  select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object('token_hash', s.token_hash)), '[]'::jsonb)
  into v_claimed
  from claimed c left join cwr_private.email_job_secrets s on s.job_id = c.id;
  return v_claimed;
end;
$$;

create function cwr.finish_email_job(p_job_id uuid, p_outcome text, p_error text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
  v_status cwr.email_job_status;
  v_retry_minutes integer[] := array[1, 5, 15, 60];
begin
  if p_outcome not in ('done', 'retry', 'not_sent') then
    raise exception 'Unknown outcome %', p_outcome using errcode = '22023';
  end if;
  select attempts into v_attempts from cwr.email_jobs where id = p_job_id and status = 'working' for update;
  if not found then
    return (select status::text from cwr.email_jobs where id = p_job_id);
  end if;
  v_status := case
    when p_outcome = 'done' then 'done'
    when p_outcome = 'not_sent' then 'not_sent'
    when v_attempts >= 5 then 'failed'
    else 'pending'
  end;
  update cwr.email_jobs
  set status = v_status,
      claimed_at = null,
      last_error = case when v_status = 'done' then null else left(p_error, 1000) end,
      next_attempt_at = case when v_status = 'pending' then now() + make_interval(mins => v_retry_minutes[v_attempts]) else next_attempt_at end
  where id = p_job_id;
  if v_status <> 'pending' then
    delete from cwr_private.email_job_secrets where job_id = p_job_id;
  end if;
  return v_status::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- The once-a-minute backup: wakes the worker only when something is due, stamps a heartbeat
-- the dashboard watches, and flags any email that has waited more than 5 minutes.
-- ---------------------------------------------------------------------------

create function cwr.wake_email_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_oldest_due timestamptz;
  v_has_stale_claim boolean;
  v_was_failing boolean;
begin
  delete from cwr_private.email_job_secrets s using cwr.email_jobs j
  where s.job_id = j.id and (j.status in ('done', 'failed', 'not_sent') or j.expires_at <= now());
  select min(next_attempt_at) into v_oldest_due from cwr.email_jobs where status = 'pending' and next_attempt_at <= now();
  select exists (select 1 from cwr.email_jobs where status = 'working' and claimed_at < now() - interval '10 minutes') into v_has_stale_claim;
  if v_oldest_due is not null and v_oldest_due < now() - interval '5 minutes' then
    select coalesce(last_error_at > coalesce(last_ok_at, '-infinity'), false) into v_was_failing
    from cwr.health_checks where tenant_id = cwr.get_default_tenant_id() and name = 'email_outbox';
    perform cwr.touch_health_check('email_outbox', false, 'An email has waited more than 5 minutes to go out');
    -- Recorded once when the wait starts, not every minute it lasts.
    if not coalesce(v_was_failing, false) then
      perform cwr.record_database_problem(cwr.get_default_tenant_id(), jsonb_build_object('action', 'database.health_check', 'stage', 'setup', 'code', 'email_outbox_waiting',
        'detail', 'An email has waited more than 5 minutes to go out. Check the email-worker and its MailerSend settings.'));
    end if;
  else
    perform cwr.touch_health_check('email_outbox', true);
  end if;
  if v_oldest_due is not null or v_has_stale_claim then
    perform cwr.post_email_worker();
  end if;
end;
$$;

create function cwr.purge_email_jobs()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from cwr.email_jobs where status in ('done', 'not_sent', 'failed') and created_at < now() - interval '90 days';
  -- Only this build's own jobs' history; other jobs' history is left alone.
  delete from cron.job_run_details d using cron.job j
  where d.jobid = j.jobid and j.jobname like 'cwr\_%' and d.end_time < now() - interval '7 days';
$$;

revoke execute on function
  cwr.forget_paused_problem_sender(), cwr.get_email_worker_secret(), cwr.post_email_worker(), cwr.wake_email_worker_after_insert(),
  cwr.is_email_outbox_live(uuid), cwr.is_email_sending_ready(uuid), cwr.enqueue_email_job(cwr.email_job_kind, uuid, uuid, uuid),
  cwr.queue_inbox_email(), cwr.queue_problem_digest(), cwr.handle_auth_email(jsonb),
  cwr.claim_email_jobs(integer), cwr.finish_email_job(uuid, text, text), cwr.wake_email_worker(), cwr.purge_email_jobs()
from public, anon, authenticated;
grant execute on function
  cwr.get_email_worker_secret(), cwr.is_email_outbox_live(uuid), cwr.enqueue_email_job(cwr.email_job_kind, uuid, uuid, uuid),
  cwr.claim_email_jobs(integer), cwr.finish_email_job(uuid, text, text)
to service_role;
-- The admin pages show whether problem emails are paused and whether sending is set up.
grant execute on function cwr.is_email_outbox_live(uuid), cwr.is_email_sending_ready(uuid) to authenticated, service_role;

select cron.schedule('cwr_email_sweep', '* * * * *', 'select cwr.wake_email_worker()');
select cron.schedule('cwr_problem_digest', '*/5 * * * *', 'select cwr.queue_problem_digest()');
select cron.schedule('cwr_purge_email_jobs', '15 4 * * *', 'select cwr.purge_email_jobs()');

-- ---------------------------------------------------------------------------
-- The delivery log and health checks accept the new values (checks re-added NOT VALID, then
-- validated, so existing rows are checked without a long lock).
-- ---------------------------------------------------------------------------

alter table cwr.alert_deliveries drop constraint alert_deliveries_thread_required;
alter table cwr.alert_deliveries add constraint alert_deliveries_thread_required
  check (kind in ('test', 'problem', 'account') or thread_id is not null) not valid;
alter table cwr.alert_deliveries validate constraint alert_deliveries_thread_required;

alter table cwr.alert_deliveries drop constraint alert_deliveries_run_id_required;
alter table cwr.alert_deliveries add constraint alert_deliveries_run_id_required
  check ((kind in ('test', 'problem', 'account')) = (job_run_id is not null)) not valid;
alter table cwr.alert_deliveries validate constraint alert_deliveries_run_id_required;

-- One account email per outbox job and recipient, like test alerts and problem digests.
create unique index alert_deliveries_run_recipient_key_v2
  on cwr.alert_deliveries (job_run_id, lower(recipient_email)) where kind in ('test', 'problem', 'account');
drop index cwr.alert_deliveries_run_recipient_key;
alter index cwr.alert_deliveries_run_recipient_key_v2 rename to alert_deliveries_run_recipient_key;

alter table cwr.health_checks drop constraint health_checks_name_check;
alter table cwr.health_checks add constraint health_checks_name_check
  check (name in ('problem_alerts', 'scheduled_jobs', 'photo_cleanup', 'problem_log_writes', 'email_outbox', 'email_sending')) not valid;
alter table cwr.health_checks validate constraint health_checks_name_check;

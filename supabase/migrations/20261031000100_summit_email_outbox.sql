-- 623 Summit's guest email queue (623Summit repo, docs/guest-email-plan.md, owner approved
-- 2026-10-31). Built like CWR's outbox (20261012000200_cwr_email_outbox.sql) but kept in summit:
-- nothing here references cwr, and nothing in cwr references this.
-- Expand-only: new tables, types, functions, triggers and jobs; bookings gains email_guest and
-- lookup_events accepts 'resend'. Nothing is queued, claimed or sent until
-- summit.email_settings.is_live is set (a separate, owner-approved step).
--
-- Deliberate differences from CWR's queue (plan N5):
--   (a) is_live is also checked when jobs are claimed and when the worker is woken;
--   (c) every kind of waiting email expires after 48 hours, and expiry runs while sending is off;
--   (d) a daily sending cap (email_settings.daily_limit) inside the claim step;
--   (e) records are deleted after 30 days, because some hold guest addresses;
--   (f) MailerSend's message id is kept on the job.
-- New functions use search_path = '', so citext is always written extensions.citext and email
-- addresses are compared with lower(a::text) = lower(b::text).

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Settings: one row. The switch, where to wake the worker, and the open items D3 and D4.
-- ---------------------------------------------------------------------------

create table summit.email_settings (
  id boolean primary key default true check (id),
  -- Off: nothing is queued, claimed or sent, and the sites make no email promise.
  is_live boolean not null default false,
  -- The summit-email-worker's address; null keeps the wake-up off. CWR's exact check.
  worker_url text check (worker_url ~ '^https?://[^\s]+$'),
  -- D3: empty means guest emails carry no Reply-To and give the house phone instead.
  reply_to extensions.citext,
  -- D4: empty means no owner alerts are queued.
  owner_alert_to extensions.citext[],
  daily_limit integer not null default 200 check (daily_limit > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into summit.email_settings default values;

-- ---------------------------------------------------------------------------
-- The queue: one row per email. Booking jobs store neither the token nor the address; the
-- worker reads both from the booking when it sends. A guest_notice keeps the old address and a
-- guest_link keeps the address that asked (plan N4); every job is deleted after 30 days.
-- ---------------------------------------------------------------------------

create type summit.email_job_kind as enum ('guest', 'guest_notice', 'owner_alert', 'guest_link');
create type summit.email_job_status as enum ('pending', 'working', 'done', 'failed', 'not_sent');

create table summit.email_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  kind summit.email_job_kind not null,
  booking_id uuid references summit.bookings (id) on delete cascade,
  event text not null check (event in (
    'received', 'confirmed', 'dates_changed', 'declined', 'cancelled', 'expired',
    'address_fixed', 'fresh_link', 'link_requested'
  )),
  recipient_email extensions.citext,
  status summit.email_job_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  expires_at timestamptz not null default now() + interval '48 hours',
  last_error text check (length(last_error) <= 1000),
  provider_message_id text check (length(provider_message_id) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_jobs_recipient_kinds check ((kind in ('guest_link', 'guest_notice')) = (recipient_email is not null)),
  constraint email_jobs_booking_required check (kind = 'guest_link' or booking_id is not null)
);

create index email_jobs_status_due_idx on summit.email_jobs (status, next_attempt_at);
create index email_jobs_booking_created_idx on summit.email_jobs (booking_id, created_at desc);

-- "Email me my link" requests and link replacements, kept only to count them (30 days).
create table summit.link_requests (
  id bigserial primary key,
  email extensions.citext not null,
  source_ip inet,
  created_at timestamptz not null default now()
);

create index link_requests_email_created_idx on summit.link_requests (lower(email::text), created_at desc);
create index link_requests_ip_created_idx on summit.link_requests (source_ip, created_at desc) where source_ip is not null;

create table summit.token_rotations (
  id bigserial primary key,
  booking_id uuid not null references summit.bookings (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index token_rotations_booking_created_idx on summit.token_rotations (booking_id, created_at desc);

-- CWR's email_jobs_set_updated_at, with its own function: cwr.set_updated_at is off limits here.
create function summit.set_email_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger email_settings_set_updated_at
  before update on summit.email_settings
  for each row execute function summit.set_email_updated_at();
create trigger email_jobs_set_updated_at
  before update on summit.email_jobs
  for each row execute function summit.set_email_updated_at();

-- ---------------------------------------------------------------------------
-- Existing tables gain what the guest features need.
-- ---------------------------------------------------------------------------

-- The owner's per-reservation switch ("Email the guest their reservation link").
alter table summit.bookings add column email_guest boolean not null default true;

-- manage-booking records each "Email me my link" request against the same per-IP limit.
alter table summit.lookup_events drop constraint lookup_events_outcome_allowed;
alter table summit.lookup_events add constraint lookup_events_outcome_allowed
  check (outcome in ('found', 'not_found', 'resend')) not valid;
alter table summit.lookup_events validate constraint lookup_events_outcome_allowed;

-- ---------------------------------------------------------------------------
-- Row level security: owners read the queue and the settings; only service_role writes.
-- link_requests and token_rotations have no policies, so only service_role reaches them.
-- ---------------------------------------------------------------------------

alter table summit.email_settings enable row level security;
alter table summit.email_jobs enable row level security;
alter table summit.link_requests enable row level security;
alter table summit.token_rotations enable row level security;

create policy email_settings_admin_read on summit.email_settings
  for select to authenticated using (summit.is_admin());
create policy email_jobs_admin_read on summit.email_jobs
  for select to authenticated using (summit.is_admin());

grant select on summit.email_settings, summit.email_jobs to authenticated;
grant all on summit.email_settings, summit.email_jobs to service_role;
grant select, insert, delete on summit.link_requests, summit.token_rotations to service_role;
grant usage on sequence summit.link_requests_id_seq, summit.token_rotations_id_seq to service_role;

-- ---------------------------------------------------------------------------
-- Reading the switch and the guest-email rule (plan item 7b).
-- ---------------------------------------------------------------------------

create function summit.email_is_live()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_live from summit.email_settings where id), false);
$$;

-- A booking gets guest emails when email_guest is on, except an owner-entered booking under an
-- owner's own address. Website bookings are never treated differently for an owner's address,
-- so nothing a guest does can reveal which addresses are owners' (plan N8).
create function summit.is_guest_email_allowed(p_email_guest boolean, p_source text, p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_email_guest
    and not (
      p_source = 'owner'
      and exists (select 1 from summit.admins a where lower(a.email::text) = lower(p_email))
    );
$$;

create function summit.will_email_guest(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select summit.email_is_live()
    and coalesce((
      select summit.is_guest_email_allowed(b.email_guest, b.source, b.email::text)
      from summit.bookings b where b.id = p_booking_id
    ), false);
$$;

-- ---------------------------------------------------------------------------
-- Waking the worker. The shared secret is made here, kept in Vault, and read back by the
-- worker through summit.get_email_worker_secret (service role only).
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'summit_email_worker_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'summit_email_worker_secret',
      'Sent by the database when it wakes summit-email-worker (623Summit docs/guest-email-plan.md)'
    );
  end if;
end;
$$;

create function summit.get_email_worker_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'summit_email_worker_secret';
$$;

-- Like CWR's: posts whenever it is called and does not look at the jobs. Unlike CWR's, it also
-- does nothing while sending is off (N5a).
create function summit.post_email_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select worker_url into v_url from summit.email_settings where id and is_live;
  if v_url is null then
    return;
  end if;
  v_secret := summit.get_email_worker_secret();
  if v_secret is null then
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

create function summit.wake_email_worker_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform summit.post_email_worker();
  return null;
end;
$$;

-- One wake-up per insert statement; pg_net sends it only after the transaction commits.
create trigger email_jobs_wake_worker
  after insert on summit.email_jobs
  for each statement execute function summit.wake_email_worker_after_insert();

-- ---------------------------------------------------------------------------
-- Booking events (plan item 9). The first matching rule wins; null means no guest email.
-- ---------------------------------------------------------------------------

create function summit.get_booking_email_event(p_old summit.bookings, p_new summit.bookings)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_old.id is null and p_new.status = 'confirmed' then 'confirmed'
    when p_old.id is null then 'received'
    when lower(p_new.email::text) <> lower(p_old.email::text) then 'address_fixed'
    when p_new.manage_token <> p_old.manage_token then 'fresh_link'
    when p_new.check_in <> p_old.check_in or p_new.check_out <> p_old.check_out then 'dates_changed'
    when p_old.status <> p_new.status and p_new.status in ('confirmed', 'declined', 'cancelled', 'expired') then p_new.status
    when p_old.status <> 'pending' and p_new.status = 'pending' then 'received'
  end;
$$;

create function summit.is_owner_alert_due(p_old summit.bookings, p_new summit.bookings)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_old.id is null then p_new.source = 'website'
    else p_new.check_in <> p_old.check_in
      or p_new.check_out <> p_old.check_out
      or lower(p_new.email::text) <> lower(p_old.email::text)
      or (p_old.status <> 'cancelled' and p_new.status = 'cancelled' and p_new.cancelled_by is not distinct from 'guest')
  end;
$$;

-- Only the newest waiting guest email for a booking goes out; it carries the current link (N1).
create function summit.queue_guest_email(p_booking_id uuid, p_event text)
returns void
language sql
security definer
set search_path = ''
as $$
  update summit.email_jobs set status = 'not_sent', last_error = 'superseded'
  where booking_id = p_booking_id and kind = 'guest' and status = 'pending';
  insert into summit.email_jobs (kind, booking_id, event) values ('guest', p_booking_id, p_event);
$$;

create function summit.queue_booking_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event text;
begin
  if not summit.email_is_live() then
    return null;
  end if;
  v_event := summit.get_booking_email_event(old, new);
  if v_event is not null and summit.is_guest_email_allowed(new.email_guest, new.source, new.email::text) then
    perform summit.queue_guest_email(new.id, v_event);
  end if;
  if v_event = 'address_fixed' and summit.is_guest_email_allowed(old.email_guest, old.source, old.email::text) then
    insert into summit.email_jobs (kind, booking_id, event, recipient_email) values ('guest_notice', new.id, v_event, old.email);
  end if;
  if v_event is not null and summit.is_owner_alert_due(old, new)
     and cardinality((select owner_alert_to from summit.email_settings where id)) > 0 then
    insert into summit.email_jobs (kind, booking_id, event) values ('owner_alert', new.id, v_event);
  end if;
  return null;
end;
$$;

create trigger bookings_queue_email
  after insert or update of status, check_in, check_out, email, manage_token on summit.bookings
  for each row execute function summit.queue_booking_email();

-- ---------------------------------------------------------------------------
-- Replacing a guest's link (plan item 8 and Addendum 4). Returns an outcome instead of raising,
-- so the attempt row is kept: refused attempts count toward the limit too.
-- ---------------------------------------------------------------------------

create function summit.rotate_manage_token(p_booking_id uuid, p_new_email extensions.citext default null)
returns table (outcome text, token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking summit.bookings%rowtype;
  v_earlier_attempts integer;
  v_token text;
begin
  if not summit.email_is_live() then
    return query select 'email_off'::text, null::text;
    return;
  end if;
  select * into v_booking from summit.bookings where id = p_booking_id for update;
  if not found then
    return query select 'not_found'::text, null::text;
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('summit_rotate:' || p_booking_id::text));
  select count(*) into v_earlier_attempts from summit.token_rotations
  where booking_id = p_booking_id and created_at > now() - interval '24 hours';
  insert into summit.token_rotations (booking_id) values (p_booking_id);
  if v_earlier_attempts >= 3 then
    return query select 'too_many_link_changes'::text, null::text;
    return;
  end if;
  if not summit.is_guest_email_allowed(v_booking.email_guest, v_booking.source, coalesce(p_new_email::text, v_booking.email::text)) then
    return query select 'email_off'::text, null::text;
    return;
  end if;
  v_token := encode(extensions.gen_random_bytes(18), 'hex');
  update summit.bookings set manage_token = v_token, email = coalesce(p_new_email, email) where id = p_booking_id;
  return query select 'ok'::text, v_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- "Email me my link" (plan item 14). Always inserts exactly one guest_link row and returns
-- nothing, so a match and a non-match do the same writes.
-- ---------------------------------------------------------------------------

-- Why a request may not be sent, judged on the requests before it; null means send it.
create function summit.get_link_refusal(p_email text, p_ip inet)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not summit.email_is_live() then 'off'
    when exists (
      select 1 from summit.link_requests
      where lower(email::text) = lower(p_email) and created_at > now() - interval '10 minutes'
    ) then 'capped'
    when (
      select count(*) from summit.link_requests
      where lower(email::text) = lower(p_email) and created_at > now() - interval '24 hours'
    ) >= 3 then 'capped'
    when (
      select count(*) from summit.link_requests
      where source_ip = p_ip and created_at > now() - interval '1 hour'
    ) >= 5 then 'capped'
    -- N7: only emails actually queued count, so fake requests cannot use the cap up.
    when (
      select count(*) from summit.email_jobs
      where kind = 'guest_link' and status in ('pending', 'working', 'done') and created_at > now() - interval '24 hours'
    ) >= 50 then 'capped'
    when not exists (
      select 1 from summit.bookings b
      where lower(b.email::text) = lower(p_email)
        and b.status in ('pending', 'confirmed')
        and b.check_out >= current_date
        and summit.is_guest_email_allowed(b.email_guest, b.source, b.email::text)
    ) then 'no_match'
  end;
$$;

create function summit.queue_link_email(p_email extensions.citext, p_ip inet)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refusal text;
begin
  -- Always in this order, so the site-wide, per-IP and per-address counts cannot race.
  perform pg_advisory_xact_lock(hashtext('summit_link:all'));
  perform pg_advisory_xact_lock(hashtext('summit_link:' || lower(p_email::text)));
  v_refusal := summit.get_link_refusal(p_email::text, p_ip);
  insert into summit.link_requests (email, source_ip) values (p_email, p_ip);
  insert into summit.email_jobs (kind, event, recipient_email, status, last_error)
  values (
    'guest_link', 'link_requested', p_email,
    (case when v_refusal is null then 'pending' else 'not_sent' end)::summit.email_job_status,
    v_refusal
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The worker's side: claim due jobs, then report how each went. Retries after 1, 5, 15 and
-- 60 minutes, then "failed" after the 5th try (CWR's ladder).
-- ---------------------------------------------------------------------------

-- Every kind expires (N5c), including a stale claim past its deadline, so it is never re-claimed.
create function summit.expire_email_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired integer;
begin
  update summit.email_jobs set status = 'not_sent', last_error = 'expired', claimed_at = null
  where expires_at <= now()
    and (status = 'pending' or (status = 'working' and claimed_at < now() - interval '10 minutes'));
  get diagnostics v_expired = row_count;
  return v_expired;
end;
$$;

-- How many more emails may be claimed before the daily cap (N5d) is reached.
create function summit.get_daily_send_room()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select s.daily_limit - (
    select count(*)::integer from summit.email_jobs where status = 'done' and updated_at > now() - interval '24 hours'
  )
  from summit.email_settings s where s.id;
$$;

create function summit.claim_email_jobs(p_limit integer default 10)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room integer;
  v_claimed jsonb;
begin
  perform summit.expire_email_jobs();
  if not summit.email_is_live() then
    return '[]'::jsonb;
  end if;
  v_room := coalesce(summit.get_daily_send_room(), 0);
  if v_room <= 0 then
    return '[]'::jsonb;
  end if;
  with due as (
    select id from summit.email_jobs
    where (status = 'pending' and next_attempt_at <= now())
       or (status = 'working' and claimed_at < now() - interval '10 minutes')
    order by next_attempt_at
    limit least(greatest(1, least(p_limit, 50)), v_room)
    for update skip locked
  ),
  claimed as (
    update summit.email_jobs j set status = 'working', claimed_at = now(), attempts = j.attempts + 1
    from due where j.id = due.id
    returning j.*
  )
  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_claimed from claimed c;
  return v_claimed;
end;
$$;

create function summit.finish_email_job(p_job_id uuid, p_outcome text, p_error text default null, p_provider_message_id text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
  v_status summit.email_job_status;
  v_retry_minutes integer[] := array[1, 5, 15, 60];
begin
  if p_outcome not in ('done', 'retry', 'not_sent') then
    raise exception 'Unknown outcome %', p_outcome using errcode = '22023';
  end if;
  select attempts into v_attempts from summit.email_jobs where id = p_job_id and status = 'working' for update;
  if not found then
    return (select status::text from summit.email_jobs where id = p_job_id);
  end if;
  v_status := (case
    when p_outcome = 'done' then 'done'
    when p_outcome = 'not_sent' then 'not_sent'
    when v_attempts >= 5 then 'failed'
    else 'pending'
  end)::summit.email_job_status;
  update summit.email_jobs
  set status = v_status,
      claimed_at = null,
      last_error = case when v_status = 'done' then null else left(p_error, 1000) end,
      provider_message_id = coalesce(left(p_provider_message_id, 200), provider_message_id),
      next_attempt_at = case when v_status = 'pending' then now() + make_interval(mins => v_retry_minutes[v_attempts]) else next_attempt_at end
  where id = p_job_id;
  return v_status::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- The once-a-minute sweep and the daily purge. No health check and no problem record: those
-- live in cwr (plan N3); the owner console's banner does that job.
-- ---------------------------------------------------------------------------

create function summit.wake_email_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Always, so waiting emails expire even while sending is off.
  perform summit.expire_email_jobs();
  if not summit.email_is_live() then
    return;
  end if;
  if exists (
    select 1 from summit.email_jobs
    where (status = 'pending' and next_attempt_at <= now())
       or (status = 'working' and claimed_at < now() - interval '10 minutes')
  ) then
    perform summit.post_email_worker();
  end if;
end;
$$;

create function summit.purge_email_jobs()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from summit.email_jobs where created_at < now() - interval '30 days';
  delete from summit.link_requests where created_at < now() - interval '30 days';
  delete from summit.token_rotations where created_at < now() - interval '30 days';
  -- Only 623's own jobs' history; other jobs' history is left alone.
  delete from cron.job_run_details d using cron.job j
  where d.jobid = j.jobid and j.jobname like 'summit\_%' and d.end_time < now() - interval '7 days';
$$;

-- ---------------------------------------------------------------------------
-- Rights: nothing for anon or signed-in users; the Edge Functions call these as service_role.
-- ---------------------------------------------------------------------------

revoke all on function
  summit.set_email_updated_at(), summit.email_is_live(), summit.is_guest_email_allowed(boolean, text, text),
  summit.will_email_guest(uuid), summit.get_email_worker_secret(), summit.post_email_worker(),
  summit.wake_email_worker_after_insert(), summit.get_booking_email_event(summit.bookings, summit.bookings),
  summit.is_owner_alert_due(summit.bookings, summit.bookings), summit.queue_guest_email(uuid, text),
  summit.queue_booking_email(), summit.rotate_manage_token(uuid, extensions.citext),
  summit.get_link_refusal(text, inet), summit.queue_link_email(extensions.citext, inet),
  summit.expire_email_jobs(), summit.get_daily_send_room(), summit.claim_email_jobs(integer),
  summit.finish_email_job(uuid, text, text, text), summit.wake_email_worker(), summit.purge_email_jobs()
from public, anon, authenticated;
grant execute on function
  summit.email_is_live(), summit.will_email_guest(uuid), summit.get_email_worker_secret(),
  summit.rotate_manage_token(uuid, extensions.citext), summit.queue_link_email(extensions.citext, inet),
  summit.claim_email_jobs(integer), summit.finish_email_job(uuid, text, text, text)
to service_role;

-- ---------------------------------------------------------------------------
-- Scheduled jobs. The summit_ prefix keeps them out of CWR's job watcher.
-- ---------------------------------------------------------------------------

select cron.schedule('summit_email_sweep', '* * * * *', 'select summit.wake_email_worker()');
select cron.schedule('summit_purge_email_jobs', '19 4 * * *', 'select summit.purge_email_jobs()');

-- Problem tracking (docs/cwr-error-tracking-plan.md, owner decisions D1–D6, 2026-09-27):
-- every problem an admin, manager, or staff member sees is recorded with a reference code,
-- grouped by what went wrong, and emailed to the owner's chosen recipients when something
-- is broken. Only trusted server code writes problems (service role, through
-- cwr.record_problem); owners read them. Background checks watch the scheduled jobs and the
-- alert sender, and each watches the other.

-- ---------------------------------------------------------------------------
-- Catalog: every action that can record a problem. Mirrors
-- src/lib/observability/problem-catalog.ts (CI compares the two). Alert emails use only
-- these labels, never text a person typed. Global reference data: no tenant, not audited.
-- ---------------------------------------------------------------------------

create table cwr.problem_catalog (
  action text primary key check (action ~ '^[a-z_]+\.[a-z_]+$'),
  area text not null check (area ~ '^[a-z_]+$'),
  label text not null check (length(label) between 1 and 120),
  section_label text not null check (length(section_label) between 1 and 60),
  -- Codes whose volume alone signals trouble (for example many wrong passwords).
  spike_codes text[] not null default '{}'
);

insert into cwr.problem_catalog (action, area, label, section_label, spike_codes) values
  ('auth.sign_in', 'auth', 'Sign in', 'Sign-in', array['invalid_credentials']),
  ('auth.verify_code', 'auth', 'Enter authenticator code', 'Sign-in', array['mfa_verification_failed']),
  ('auth.start_code_setup', 'auth', 'Start authenticator setup', 'Sign-in', '{}'),
  ('auth.confirm_code_setup', 'auth', 'Finish authenticator setup', 'Sign-in', '{}'),
  ('auth.request_password_reset', 'auth', 'Ask for a password reset', 'Sign-in', '{}'),
  ('auth.set_password', 'auth', 'Set a new password', 'Sign-in', '{}'),
  ('auth.open_email_link', 'auth', 'Open an invite or reset link', 'Sign-in', '{}'),
  ('auth.sign_out', 'auth', 'Sign out', 'Sign-in', '{}'),
  ('auth.session_check', 'auth', 'Check the sign-in session', 'Sign-in', '{}'),
  ('auth.session_check_invalid', 'auth', 'Unreadable sign-in session', 'Sign-in', '{}'),
  ('auth.access_check', 'auth', 'Check admin access', 'Sign-in', '{}'),
  ('auth.bot_check_widget', 'auth', 'Load the bot check', 'Sign-in', '{}'),
  ('auth.browser_error', 'auth', 'Browser error on a sign-in page', 'Sign-in', '{}'),
  ('portal.page_crash', 'portal', 'Open an admin page', 'Admin portal', '{}'),
  ('portal.browser_error', 'portal', 'Browser error on an admin page', 'Admin portal', '{}'),
  ('portal.keep_alive', 'portal', 'Keep the session active', 'Admin portal', '{}'),
  ('portal.page_not_found', 'portal', 'Open a missing admin page', 'Admin portal', '{}'),
  ('portal.wrong_role', 'portal', 'Open a page the role can''t use', 'Admin portal', '{}'),
  ('portal.load_frame', 'portal', 'Load the admin menu', 'Admin portal', '{}'),
  ('dashboard.load', 'dashboard', 'Load the dashboard', 'Dashboard', '{}'),
  ('listings.load', 'listings', 'Load listings', 'Listings', '{}'),
  ('listings.create', 'listings', 'Create a listing', 'Listings', '{}'),
  ('listings.update', 'listings', 'Edit a listing', 'Listings', '{}'),
  ('listings.change_state', 'listings', 'Publish or change a listing''s status', 'Listings', '{}'),
  ('listings.move', 'listings', 'Reorder listings', 'Listings', '{}'),
  ('listings.move_photo', 'listings', 'Reorder listing photos', 'Listings', '{}'),
  ('listings.add_photo', 'listings', 'Add a listing photo', 'Listings', '{}'),
  ('listings.update_photo_alt', 'listings', 'Edit a photo description', 'Listings', '{}'),
  ('photos.request_upload_link', 'photos', 'Start a photo upload', 'Photos', '{}'),
  ('photos.prepare', 'photos', 'Prepare a photo in the browser', 'Photos', '{}'),
  ('photos.upload', 'photos', 'Upload a photo', 'Photos', '{}'),
  ('team.load', 'team', 'Load team members', 'Team', '{}'),
  ('team.create', 'team', 'Add a team member', 'Team', '{}'),
  ('team.update', 'team', 'Edit a team member', 'Team', '{}'),
  ('team.set_photo', 'team', 'Set a team member''s photo', 'Team', '{}'),
  ('team.remove_photo', 'team', 'Remove a team member''s photo', 'Team', '{}'),
  ('team.move', 'team', 'Reorder team members', 'Team', '{}'),
  ('team.set_visibility', 'team', 'Show or hide a team member', 'Team', '{}'),
  ('connections.load', 'connections', 'Load connections', 'Connections', '{}'),
  ('connections.create', 'connections', 'Add a connection', 'Connections', '{}'),
  ('connections.update', 'connections', 'Edit a connection', 'Connections', '{}'),
  ('connections.set_photo', 'connections', 'Set a connection''s photo', 'Connections', '{}'),
  ('connections.remove_photo', 'connections', 'Remove a connection''s photo', 'Connections', '{}'),
  ('connections.move', 'connections', 'Reorder connections', 'Connections', '{}'),
  ('connections.set_visibility', 'connections', 'Show or hide a connection', 'Connections', '{}'),
  ('homework.load', 'homework', 'Load Homework', 'Homework', '{}'),
  ('homework.create_video', 'homework', 'Add a Homework video', 'Homework', '{}'),
  ('homework.create_download', 'homework', 'Add a Homework download', 'Homework', '{}'),
  ('homework.update_video', 'homework', 'Edit a Homework video', 'Homework', '{}'),
  ('homework.update_download', 'homework', 'Edit a Homework download', 'Homework', '{}'),
  ('homework.move', 'homework', 'Reorder Homework', 'Homework', '{}'),
  ('homework.set_visibility', 'homework', 'Show or hide Homework', 'Homework', '{}'),
  ('homework.set_cover', 'homework', 'Set a Homework cover picture', 'Homework', '{}'),
  ('homework.remove_cover', 'homework', 'Remove a Homework cover picture', 'Homework', '{}'),
  ('homework.request_upload_link', 'homework', 'Start a Homework file upload', 'Homework', '{}'),
  ('homework.upload_file', 'homework', 'Upload a Homework file', 'Homework', '{}'),
  ('homework.save_file', 'homework', 'Save an uploaded Homework file', 'Homework', '{}'),
  ('homework.remove_captions', 'homework', 'Remove video captions', 'Homework', '{}'),
  ('inbox.load', 'inbox', 'Load the inbox', 'Inbox', '{}'),
  ('inbox.assign', 'inbox', 'Assign a request', 'Inbox', '{}'),
  ('inbox.add_note', 'inbox', 'Add an internal note', 'Inbox', '{}'),
  ('inbox.send_reply', 'inbox', 'Send an email reply', 'Inbox', '{}'),
  ('inbox.set_status', 'inbox', 'Close or reopen a request', 'Inbox', '{}'),
  ('closed_deals.load', 'closed_deals', 'Load closed deals', 'Closed deals', '{}'),
  ('closed_deals.save', 'closed_deals', 'Record a closed deal', 'Closed deals', '{}'),
  ('closed_deals.export', 'closed_deals', 'Download closed deals', 'Closed deals', '{}'),
  ('chats.load', 'chats', 'Load chat logs', 'Chats', '{}'),
  ('notifications.load', 'notifications', 'Load notification settings', 'Notifications', '{}'),
  ('notifications.add_recipient', 'notifications', 'Add an alert recipient', 'Notifications', '{}'),
  ('notifications.restore_recipient', 'notifications', 'Undo removing an alert recipient', 'Notifications', '{}'),
  ('notifications.remove_recipient', 'notifications', 'Remove an alert recipient', 'Notifications', '{}'),
  ('notifications.set_recipient_active', 'notifications', 'Pause or resume an alert recipient', 'Notifications', '{}'),
  ('notifications.set_recipient_problem_alerts', 'notifications', 'Turn problem alerts on or off', 'Notifications', '{}'),
  ('notifications.send_test_alert', 'notifications', 'Send a test alert', 'Notifications', '{}'),
  ('notifications.retry_delivery', 'notifications', 'Retry a failed email', 'Notifications', '{}'),
  ('users.load', 'users', 'Load users', 'Users', '{}'),
  ('users.invite', 'users', 'Invite a user', 'Users', '{}'),
  ('users.change_role', 'users', 'Change a user''s role', 'Users', '{}'),
  ('users.remove_access', 'users', 'Remove a user''s access', 'Users', '{}'),
  ('users.restore_access', 'users', 'Undo removing a user''s access', 'Users', '{}'),
  ('users.reset_sign_in_codes', 'users', 'Reset a user''s sign-in codes', 'Users', '{}'),
  ('chat_policy.load', 'chat_policy', 'Load the chat policy', 'Chat policy', '{}'),
  ('chat_policy.save_draft', 'chat_policy', 'Save the chat policy draft', 'Chat policy', '{}'),
  ('chat_policy.restore_version', 'chat_policy', 'Restore an old chat policy', 'Chat policy', '{}'),
  ('chat_policy.publish', 'chat_policy', 'Publish the chat policy', 'Chat policy', '{}'),
  ('chat_policy.add_test', 'chat_policy', 'Add a policy test question', 'Chat policy', '{}'),
  ('chat_policy.restore_test', 'chat_policy', 'Undo removing a test question', 'Chat policy', '{}'),
  ('chat_policy.remove_test', 'chat_policy', 'Remove a policy test question', 'Chat policy', '{}'),
  ('chat_policy.run_tests', 'chat_policy', 'Run the policy tests', 'Chat policy', '{}'),
  ('chat_policy.test_chat', 'chat_policy', 'Try the chat assistant', 'Chat policy', '{}'),
  ('tracking.load', 'tracking', 'Load ads & analytics settings', 'Ads & analytics', '{}'),
  ('tracking.save', 'tracking', 'Save ads & analytics settings', 'Ads & analytics', '{}'),
  ('tracking.mark_reviewed', 'tracking', 'Mark tags reviewed', 'Ads & analytics', '{}'),
  ('contact.load', 'contact', 'Load contact & footer settings', 'Contact & footer', '{}'),
  ('contact.save', 'contact', 'Save contact & footer settings', 'Contact & footer', '{}'),
  ('trash.load', 'trash', 'Load the trash', 'Trash', '{}'),
  ('trash.move_to_trash', 'trash', 'Move something to the trash', 'Trash', '{}'),
  ('trash.restore', 'trash', 'Restore from the trash', 'Trash', '{}'),
  ('trash.delete_forever', 'trash', 'Delete forever', 'Trash', '{}'),
  ('jobs.alert_email', 'jobs', 'Send an alert email', 'Background jobs', '{}'),
  ('jobs.alert_dead_letter', 'jobs', 'Give up on an alert email', 'Background jobs', '{}'),
  ('jobs.problem_alerts', 'jobs', 'Send problem alerts', 'Background jobs', '{}'),
  ('jobs.photo_cleanup', 'jobs', 'Nightly photo clean-up', 'Background jobs', '{}'),
  ('jobs.watchdog', 'jobs', 'Check the database clean-up schedule', 'Background jobs', '{}'),
  ('database.scheduled_job', 'database', 'Nightly database clean-up', 'Database', '{}'),
  ('database.health_check', 'database', 'Background check', 'Database', '{}'),
  ('unknown.unknown', 'unknown', 'Unlisted action', 'Unknown', '{}');

-- ---------------------------------------------------------------------------
-- Problem events (append-only) and problem groups (one per kind of problem)
-- ---------------------------------------------------------------------------

create table cwr.problem_events (
  id uuid primary key,
  tenant_id uuid not null,
  occurred_at timestamptz not null default now(),
  origin text not null check (origin in ('server_member', 'server_signin', 'browser_member', 'browser_signin', 'job', 'database', 'github')),
  area text not null check (length(area) <= 40),
  action text not null check (length(action) <= 80),
  stage text not null check (stage in ('validate', 'rule', 'not_found', 'access', 'duplicate', 'database', 'storage', 'browser', 'network', 'external', 'load', 'auth', 'job', 'unexpected', 'setup')),
  severity text not null check (severity in ('info', 'warning', 'error', 'critical')),
  code text check (length(code) <= 64),
  shown_message text check (length(shown_message) <= 300),
  detail text check (length(detail) <= 2000),
  fingerprint text not null check (length(fingerprint) = 32),
  reference text not null unique check (reference ~ '^CWR-[0-9A-Z]{3}-[0-9A-Z]{3}$'),
  request_id text check (length(request_id) <= 128),
  actor_id uuid,
  actor_role text check (length(actor_role) <= 20),
  record_table text check (length(record_table) <= 63),
  record_id uuid,
  page_path text check (length(page_path) <= 300),
  release text check (length(release) <= 64),
  digest text check (length(digest) <= 64)
);
-- No foreign keys on purpose (like cwr.audit_log): problems outlive what they describe.

create index problem_events_tenant_occurred_idx on cwr.problem_events (tenant_id, occurred_at desc);
create index problem_events_fingerprint_idx on cwr.problem_events (tenant_id, fingerprint, occurred_at desc);
create index problem_events_actor_idx on cwr.problem_events (tenant_id, actor_id, occurred_at desc);
create index problem_events_origin_idx on cwr.problem_events (tenant_id, origin, occurred_at desc);
create index problem_events_request_idx on cwr.problem_events (request_id) where request_id is not null;
create index problem_events_digest_idx on cwr.problem_events (digest) where digest is not null;

create table cwr.problem_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references cwr.tenants (id) on delete cascade,
  fingerprint text not null check (length(fingerprint) = 32),
  area text not null,
  action text not null,
  stage text not null,
  code text,
  max_severity text not null check (max_severity in ('info', 'warning', 'error', 'critical')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  total_count integer not null default 0 check (total_count >= 0),
  suppressed_count integer not null default 0 check (suppressed_count >= 0),
  alert_pending boolean not null default false,
  alert_pending_at timestamptz,
  last_alerted_at timestamptz,
  last_alerted_severity text check (last_alerted_severity in ('info', 'warning', 'error', 'critical')),
  reopened_at timestamptz,
  resolved_by uuid,
  resolution_note text check (length(resolution_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, fingerprint)
);

create index problem_groups_tenant_last_seen_idx on cwr.problem_groups (tenant_id, last_seen_at desc);
create index problem_groups_pending_idx on cwr.problem_groups (tenant_id) where alert_pending;

-- One problem-alert digest. A digest that fails is re-sent with the same id and groups, so
-- people who already got it are skipped (alert_deliveries is unique per run and recipient).
create table cwr.problem_alert_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references cwr.tenants (id) on delete cascade,
  group_ids uuid[] not null check (cardinality(group_ids) > 0),
  severity_snapshot jsonb not null,
  status text not null default 'open' check (status in ('open', 'sent', 'abandoned')),
  attempts integer not null default 0 check (attempts >= 0),
  claimed_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index problem_alert_runs_tenant_idx on cwr.problem_alert_runs (tenant_id, created_at desc);

-- Heartbeats and outcomes of the background checks (the dead-man switches). Outcome times use
-- clock_timestamp() so a success and a failure in one transaction still have an order.
create table cwr.health_checks (
  tenant_id uuid not null references cwr.tenants (id) on delete cascade,
  name text not null check (name in ('problem_alerts', 'scheduled_jobs', 'photo_cleanup', 'problem_log_writes')),
  last_run_at timestamptz,
  last_ok_at timestamptz,
  last_error text check (length(last_error) <= 300),
  last_error_at timestamptz,
  last_runid bigint,
  created_at timestamptz not null default now(),
  primary key (tenant_id, name)
);

create trigger problem_groups_set_updated_at
  before update on cwr.problem_groups
  for each row execute function cwr.set_updated_at();
create trigger problem_groups_guard_status
  before insert or update on cwr.problem_groups
  for each row execute function cwr.guard_workflow_state('status', 'open');
-- Only status and resolution changes are audited, not every counted event.
create trigger problem_groups_record_audit
  after insert or delete on cwr.problem_groups
  for each row execute function cwr.record_audit();
create trigger problem_groups_record_audit_status
  after update on cwr.problem_groups
  for each row
  when (old.status is distinct from new.status or old.resolution_note is distinct from new.resolution_note)
  execute function cwr.record_audit();

create function cwr.prevent_problem_event_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('cwr.retention_purge', true) = 'on' then
    return old;
  end if;
  raise exception 'The problem log is append-only' using errcode = 'insufficient_privilege';
end;
$$;

create trigger problem_events_prevent_change
  before update or delete on cwr.problem_events
  for each row execute function cwr.prevent_problem_event_change();
create trigger problem_events_prevent_truncate
  before truncate on cwr.problem_events
  for each statement execute function cwr.prevent_problem_event_change();

-- ---------------------------------------------------------------------------
-- Workflow: a problem group is open or resolved, changed only through cwr.transition.
-- ---------------------------------------------------------------------------

alter table cwr.workflows drop constraint workflows_table_name_check;
alter table cwr.workflows add constraint workflows_table_name_check
  check (table_name in ('listings', 'inbox_threads', 'chat_policies', 'problem_groups'));

create or replace function cwr.install_default_workflows(p_tenant_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  with definitions (key, table_name, state_column) as (
    values
      ('listing_status', 'listings', 'status'),
      ('listing_publish', 'listings', 'publish_state'),
      ('inbox_status', 'inbox_threads', 'status'),
      ('chat_policy_status', 'chat_policies', 'status'),
      ('problem_status', 'problem_groups', 'status')
  ),
  created as (
    insert into cwr.workflows (tenant_id, key, table_name, state_column)
    select p_tenant_id, d.key, d.table_name, d.state_column from definitions d
    on conflict (tenant_id, key) do nothing
    returning id, key
  ),
  moves (key, from_state, to_state, allowed_roles) as (
    values
      ('listing_status', 'active', 'pending', '{owner,manager}'),
      ('listing_status', 'pending', 'active', '{owner,manager}'),
      ('listing_status', 'active', 'sold', '{owner,manager}'),
      ('listing_status', 'pending', 'sold', '{owner,manager}'),
      ('listing_status', 'sold', 'active', '{owner,manager}'),
      ('listing_publish', 'draft', 'live', '{owner,manager}'),
      ('listing_publish', 'live', 'draft', '{owner,manager}'),
      ('inbox_status', 'new', 'assigned', '{owner,manager}'),
      ('inbox_status', 'new', 'replied', '{owner,manager}'),
      ('inbox_status', 'new', 'closed', '{owner,manager}'),
      ('inbox_status', 'assigned', 'replied', '{owner,manager,staff}'),
      ('inbox_status', 'assigned', 'closed', '{owner,manager,staff}'),
      ('inbox_status', 'replied', 'assigned', '{owner,manager,staff}'),
      ('inbox_status', 'replied', 'closed', '{owner,manager,staff}'),
      ('inbox_status', 'closed', 'assigned', '{owner,manager}'),
      ('chat_policy_status', 'draft', 'published', '{owner}'),
      ('chat_policy_status', 'published', 'archived', '{owner}'),
      -- Owners resolve; a new occurrence reopens (the server, as service role).
      ('problem_status', 'open', 'resolved', '{owner}'),
      ('problem_status', 'resolved', 'open', '{owner}')
  )
  insert into cwr.workflow_transitions (tenant_id, workflow_id, from_state, to_state, allowed_roles)
  select p_tenant_id, c.id, m.from_state, m.to_state, m.allowed_roles::cwr.member_role[]
  from moves m
  join created c on c.key = m.key;
$$;

select cwr.install_default_workflows(id) from cwr.tenants;

-- ---------------------------------------------------------------------------
-- Alert deliveries: problem digests are grouped by run like test alerts. The two
-- unnamed checks from 20260925001400 are replaced by named ones.
-- ---------------------------------------------------------------------------

alter table cwr.alert_deliveries drop constraint alert_deliveries_check;
alter table cwr.alert_deliveries drop constraint alert_deliveries_check1;
alter table cwr.alert_deliveries add constraint alert_deliveries_thread_required
  check (kind in ('test', 'problem') or thread_id is not null);
alter table cwr.alert_deliveries add constraint alert_deliveries_run_id_required
  check ((kind in ('test', 'problem')) = (job_run_id is not null));

drop index cwr.alert_deliveries_test_recipient_key;
create unique index alert_deliveries_run_recipient_key
  on cwr.alert_deliveries (job_run_id, lower(recipient_email)) where kind in ('test', 'problem');

-- ---------------------------------------------------------------------------
-- Problem-alert recipients: only owners choose who gets them (owner decision D4), and a
-- manager cannot redirect or silence them by changing, pausing, or removing a chosen recipient.
-- ---------------------------------------------------------------------------

alter table cwr.notification_recipients
  add column gets_problem_alerts boolean not null default false;

-- SECURITY INVOKER on purpose: the caller's own role decides (service role or an owner).
create function cwr.guard_problem_alert_recipient()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tenant_id uuid := case when tg_op = 'DELETE' then old.tenant_id else new.tenant_id end;
  v_is_change boolean;
begin
  v_is_change := case tg_op
    when 'INSERT' then new.gets_problem_alerts
    when 'DELETE' then old.gets_problem_alerts
    else new.gets_problem_alerts is distinct from old.gets_problem_alerts
      or (old.gets_problem_alerts and (lower(new.email) is distinct from lower(old.email) or new.is_active is distinct from old.is_active))
  end;
  if not v_is_change or cwr.is_service_context() or v_tenant_id in (select cwr.owner_tenant_ids()) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'Only an owner can change who gets problem alerts' using errcode = 'insufficient_privilege';
end;
$$;

create trigger notification_recipients_guard_problem_alerts
  before insert or update or delete on cwr.notification_recipients
  for each row execute function cwr.guard_problem_alert_recipient();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function cwr.get_severity_rank(p_severity text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_severity when 'critical' then 4 when 'error' then 3 when 'warning' then 2 else 1 end;
$$;

-- The same rules as src/lib/observability/scrub.ts, applied again as defence in depth.
create function cwr.get_scrubbed_text(p_text text, p_max_length integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(p_text, 'Key \([^)]*\)=\([^)]*\)', 'Key (…)=(…)', 'g'),
              '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email]', 'g'),
            'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*', '[token]', 'g'),
          '(?i)bearer\s+[A-Za-z0-9._~+/-]+=*', '[token]', 'g'),
        '\+?\(?\d[\d\s().-]{5,}\d', '[number]', 'g'),
      '\d{6,}', '[number]', 'g'),
    p_max_length
  );
$$;

create function cwr.get_default_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from cwr.tenants where slug = 'cwr';
$$;

create function cwr.get_problem_reference()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'CWR-' || string_agg(
    substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', 1 + floor(random() * 32)::int, 1)
      || case when n = 3 then '-' else '' end,
    '' order by n)
  from generate_series(1, 6) as n;
$$;

-- ---------------------------------------------------------------------------
-- Health checks
-- ---------------------------------------------------------------------------

/** Heartbeat only: proves a check ran, never that it succeeded. */
create function cwr.touch_heartbeat(p_name text, p_tenant_id uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into cwr.health_checks (tenant_id, name, last_run_at)
  values (coalesce(p_tenant_id, cwr.get_default_tenant_id()), p_name, now())
  on conflict (tenant_id, name) do update set last_run_at = now();
$$;

/** Records an outcome: success sets last_ok_at (at most once a minute), failure the error. */
create function cwr.touch_health_check(p_name text, p_is_ok boolean, p_error text default null, p_tenant_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := coalesce(p_tenant_id, cwr.get_default_tenant_id());
begin
  insert into cwr.health_checks (tenant_id, name, last_run_at)
  values (v_tenant_id, p_name, now())
  on conflict (tenant_id, name) do update set last_run_at = now();
  if p_is_ok then
    update cwr.health_checks set last_ok_at = clock_timestamp()
    where tenant_id = v_tenant_id and name = p_name
      and coalesce(last_ok_at, '-infinity') < now() - interval '1 minute';
    return;
  end if;
  update cwr.health_checks
  set last_error = cwr.get_scrubbed_text(coalesce(p_error, 'Failed'), 300), last_error_at = clock_timestamp()
  where tenant_id = v_tenant_id and name = p_name;
end;
$$;

insert into cwr.health_checks (tenant_id, name, last_run_at, last_ok_at, last_runid)
select t.id, n.name, now(), now(),
  case when n.name = 'scheduled_jobs' then (select max(runid) from cron.job_run_details) end
from cwr.tenants t
cross join (values ('problem_alerts'), ('scheduled_jobs'), ('photo_cleanup'), ('problem_log_writes')) as n (name);

-- ---------------------------------------------------------------------------
-- Recording a problem. Called only by trusted server code (service role): the app
-- (for signed-in members and the sign-in pages), the Worker, GitHub clean-up, and the
-- database's own checks. Never raises for odd input; it normalises instead.
-- ---------------------------------------------------------------------------

create function cwr.get_problem_bucket_limit(p_origin text, p_severity text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when cwr.get_severity_rank(p_severity) >= 3 and p_origin not like 'browser_%' then 300
    when p_origin in ('server_member', 'browser_member') then 30
    when p_origin = 'server_signin' then 60
    when p_origin = 'browser_signin' then 30
    else 120
  end;
$$;

create function cwr.is_problem_flood(p_event cwr.problem_events)
returns boolean
language sql
stable
set search_path = ''
as $$
  select count(*) >= cwr.get_problem_bucket_limit(p_event.origin, p_event.severity)
  from cwr.problem_events e
  where e.tenant_id = p_event.tenant_id
    and e.occurred_at > now() - interval '60 seconds'
    and case
      when cwr.get_severity_rank(p_event.severity) >= 3 and p_event.origin not like 'browser_%'
        then cwr.get_severity_rank(e.severity) >= 3 and e.origin not like 'browser_%'
      when p_event.origin in ('server_member', 'browser_member')
        then e.actor_id is not distinct from p_event.actor_id and e.origin in ('server_member', 'browser_member')
      else e.origin = p_event.origin
    end;
$$;

create function cwr.is_problem_spike(p_event cwr.problem_events)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_event.origin like 'server_%'
    and exists (
      select 1 from cwr.problem_catalog c
      where c.action = p_event.action and p_event.code = any (c.spike_codes)
    )
    and (
      select count(*) from cwr.problem_events e
      where e.tenant_id = p_event.tenant_id and e.fingerprint = p_event.fingerprint
        and e.occurred_at > now() - interval '15 minutes'
    ) >= 20;
$$;

create function cwr.get_normalized_problem(p jsonb)
returns cwr.problem_events
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_event cwr.problem_events;
  v_catalog cwr.problem_catalog;
begin
  select * into v_catalog from cwr.problem_catalog where action = p ->> 'action';
  v_event.id := coalesce((p ->> 'id')::uuid, gen_random_uuid());
  v_event.tenant_id := coalesce((p ->> 'tenant_id')::uuid, cwr.get_default_tenant_id());
  v_event.occurred_at := now();
  v_event.origin := case when p ->> 'origin' in ('server_member', 'server_signin', 'browser_member', 'browser_signin', 'job', 'database', 'github') then p ->> 'origin' else 'job' end;
  v_event.action := coalesce(v_catalog.action, 'unknown.unknown');
  v_event.area := coalesce(v_catalog.area, 'unknown');
  v_event.stage := case when p ->> 'stage' in ('validate', 'rule', 'not_found', 'access', 'duplicate', 'database', 'storage', 'browser', 'network', 'external', 'load', 'auth', 'job', 'unexpected', 'setup') then p ->> 'stage' else 'unexpected' end;
  v_event.severity := case when p ->> 'severity' in ('info', 'warning', 'error', 'critical') then p ->> 'severity' else 'error' end;
  if v_event.origin = 'browser_signin' and cwr.get_severity_rank(v_event.severity) > 2 then
    v_event.severity := 'warning';
  end if;
  v_event.code := left(p ->> 'code', 64);
  v_event.shown_message := cwr.get_scrubbed_text(p ->> 'shown_message', 300);
  v_event.detail := cwr.get_scrubbed_text(
    case when v_catalog.action is null then 'Unlisted action: ' || left(coalesce(p ->> 'action', ''), 80) || '. ' else '' end || coalesce(p ->> 'detail', ''),
    2000);
  v_event.fingerprint := left(encode(sha256(convert_to(concat_ws('|', v_event.area, v_event.action, v_event.stage, v_event.code), 'UTF8')), 'hex'), 32);
  v_event.reference := case when p ->> 'reference' ~ '^CWR-[0-9A-Z]{3}-[0-9A-Z]{3}$' then p ->> 'reference' else cwr.get_problem_reference() end;
  v_event.request_id := left(p ->> 'request_id', 128);
  v_event.actor_id := (p ->> 'actor_id')::uuid;
  v_event.actor_role := left(p ->> 'actor_role', 20);
  v_event.record_table := left(p ->> 'record_table', 63);
  v_event.record_id := (p ->> 'record_id')::uuid;
  v_event.page_path := left(split_part(p ->> 'page_path', '?', 1), 300);
  v_event.release := left(p ->> 'release', 64);
  v_event.digest := left(p ->> 'digest', 64);
  return v_event;
end;
$$;

create function cwr.insert_problem_event(p_event cwr.problem_events)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_inserted_id uuid;
begin
  -- Reference codes are short (6 characters), so one may already be taken: try fresh ones.
  for v_attempt in 1..5 loop
    begin
      insert into cwr.problem_events select p_event.* on conflict (id) do nothing returning id into v_inserted_id;
      return case when v_inserted_id is null then null else p_event.reference end;
    exception when unique_violation then
      p_event.reference := cwr.get_problem_reference();
    end;
  end loop;
  raise exception 'No free problem reference code after 5 tries' using errcode = 'unique_violation';
end;
$$;

create function cwr.count_problem_in_group(p_event cwr.problem_events, p_is_suppressed boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_group cwr.problem_groups;
  v_should_alert boolean := cwr.get_severity_rank(p_event.severity) >= 3 or cwr.is_problem_spike(p_event);
begin
  insert into cwr.problem_groups (tenant_id, fingerprint, area, action, stage, code, max_severity, total_count, suppressed_count)
  values (p_event.tenant_id, p_event.fingerprint, p_event.area, p_event.action, p_event.stage, p_event.code, p_event.severity, 1, case when p_is_suppressed then 1 else 0 end)
  on conflict (tenant_id, fingerprint) do update set
    last_seen_at = now(),
    total_count = cwr.problem_groups.total_count + 1,
    suppressed_count = cwr.problem_groups.suppressed_count + excluded.suppressed_count,
    max_severity = case when cwr.get_severity_rank(excluded.max_severity) > cwr.get_severity_rank(cwr.problem_groups.max_severity)
      then excluded.max_severity else cwr.problem_groups.max_severity end
  returning * into v_group;
  if v_should_alert then
    update cwr.problem_groups set alert_pending = true, alert_pending_at = now() where id = v_group.id;
  end if;
  if v_group.status = 'resolved' then
    perform cwr.transition('problem_status', v_group.id, 'open');
    update cwr.problem_groups set reopened_at = clock_timestamp() where id = v_group.id;
  end if;
end;
$$;

create function cwr.record_problem(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event cwr.problem_events := cwr.get_normalized_problem(p);
  v_existing_reference text;
  v_reference text;
begin
  select reference into v_existing_reference from cwr.problem_events where id = v_event.id;
  if v_existing_reference is not null then
    return jsonb_build_object('reference', v_existing_reference, 'stored', true, 'suppressed', false);
  end if;
  if cwr.is_problem_flood(v_event) then
    perform cwr.count_problem_in_group(v_event, true);
    return jsonb_build_object('reference', null, 'stored', false, 'suppressed', true);
  end if;
  v_reference := cwr.insert_problem_event(v_event);
  if v_reference is null then
    select reference into v_reference from cwr.problem_events where id = v_event.id;
    return jsonb_build_object('reference', v_reference, 'stored', true, 'suppressed', false);
  end if;
  perform cwr.count_problem_in_group(v_event, false);
  if v_event.origin like 'server_%' or v_event.origin like 'browser_%' then
    perform cwr.touch_health_check('problem_log_writes', true, null, v_event.tenant_id);
  end if;
  return jsonb_build_object('reference', v_reference, 'stored', true, 'suppressed', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Problem-alert digests, sent by the Worker's scheduled run every 5 minutes.
-- ---------------------------------------------------------------------------

create function cwr.is_problem_alert_backing_off(p_tenant_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  with recent as (
    select status, finished_at from cwr.problem_alert_runs
    where tenant_id = p_tenant_id and status in ('sent', 'abandoned')
    order by finished_at desc limit 6
  ),
  streak as (
    select count(*) as abandoned_count, max(finished_at) as last_finished_at
    from (select status, finished_at, bool_and(status = 'abandoned') over (order by finished_at desc) as is_streak from recent) r
    where is_streak
  )
  select abandoned_count > 0
    and last_finished_at > now() - least(interval '5 minutes' * power(2, abandoned_count - 1), interval '1 hour')
  from streak;
$$;

create function cwr.get_problem_alert_payload(p_run cwr.problem_alert_runs)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'run_id', p_run.id,
    'tenant_id', p_run.tenant_id,
    'groups', coalesce(jsonb_agg(jsonb_build_object(
      'section', c.section_label,
      'label', c.label,
      'severity', g.max_severity,
      'count', g.total_count,
      'first_seen_at', g.first_seen_at,
      'last_seen_at', g.last_seen_at,
      'reference', (select e.reference from cwr.problem_events e where e.tenant_id = g.tenant_id and e.fingerprint = g.fingerprint order by e.occurred_at desc limit 1)
    ) order by cwr.get_severity_rank(g.max_severity) desc, g.last_seen_at desc), '[]'::jsonb)
  )
  from cwr.problem_groups g
  join cwr.problem_catalog c on c.action = g.action
  where g.id = any (p_run.group_ids);
$$;

create function cwr.create_problem_alert_run(p_tenant_id uuid, p_limit integer)
returns cwr.problem_alert_runs
language plpgsql
set search_path = ''
as $$
declare
  v_run cwr.problem_alert_runs;
  v_group_ids uuid[];
  v_snapshot jsonb;
begin
  with due as (
    select g.id, g.max_severity from cwr.problem_groups g
    where g.tenant_id = p_tenant_id and g.alert_pending
      and (g.last_alerted_at is null
        or g.last_alerted_at < now() - interval '1 hour'
        or g.reopened_at > g.last_alerted_at
        or cwr.get_severity_rank(g.max_severity) > cwr.get_severity_rank(coalesce(g.last_alerted_severity, 'info')))
    order by cwr.get_severity_rank(g.max_severity) desc, g.last_seen_at desc
    limit p_limit
    for update skip locked
  )
  select array_agg(id), jsonb_object_agg(id, max_severity) into v_group_ids, v_snapshot from due;
  if v_group_ids is null then
    return null;
  end if;
  insert into cwr.problem_alert_runs (tenant_id, group_ids, severity_snapshot, claimed_at)
  values (p_tenant_id, v_group_ids, v_snapshot, now())
  returning * into v_run;
  return v_run;
end;
$$;

/** Returns the digest to send (an unfinished one first), or null when nothing is due. */
create function cwr.claim_problem_alerts(p_tenant_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run cwr.problem_alert_runs;
begin
  select * into v_run from cwr.problem_alert_runs
  where tenant_id = p_tenant_id and status = 'open'
  order by created_at
  limit 1
  for update skip locked;
  if found then
    if v_run.claimed_at > now() - interval '10 minutes' then
      return null;
    end if;
    update cwr.problem_alert_runs set claimed_at = now() where id = v_run.id;
    return cwr.get_problem_alert_payload(v_run);
  end if;
  if cwr.is_problem_alert_backing_off(p_tenant_id) then
    return null;
  end if;
  v_run := cwr.create_problem_alert_run(p_tenant_id, p_limit);
  return case when v_run.id is null then null else cwr.get_problem_alert_payload(v_run) end;
end;
$$;

create function cwr.mark_problem_alert_sent(p_run cwr.problem_alert_runs)
returns void
language sql
set search_path = ''
as $$
  update cwr.problem_alert_runs set status = 'sent', finished_at = clock_timestamp(), claimed_at = null where id = p_run.id;
  update cwr.problem_groups g
  set last_alerted_at = clock_timestamp(),
      last_alerted_severity = p_run.severity_snapshot ->> g.id::text,
      alert_pending = g.alert_pending_at > p_run.created_at
  where g.id = any (p_run.group_ids);
$$;

create function cwr.abandon_problem_alert(p_run cwr.problem_alert_runs, p_code text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update cwr.problem_alert_runs set status = 'abandoned', finished_at = clock_timestamp(), claimed_at = null where id = p_run.id;
  perform cwr.record_problem(jsonb_build_object(
    'tenant_id', p_run.tenant_id, 'origin', 'job', 'action', 'jobs.problem_alerts', 'stage', 'setup',
    'severity', 'critical', 'code', p_code,
    'detail', case p_code when 'emails_refused' then 'Every problem-alert email was refused. Check the email service settings.'
      else 'Problem-alert emails kept failing for an hour.' end));
end;
$$;

/**
 * p_outcome: 'sent' (every email went out or can never go out), 'failed' (a retry could
 * help), 'refused' (none went out and none can), or 'not_sent' (email is not set up).
 */
create function cwr.finish_problem_alerts(p_run_id uuid, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run cwr.problem_alert_runs;
begin
  select * into v_run from cwr.problem_alert_runs where id = p_run_id and status = 'open' for update;
  if not found then
    return;
  end if;
  if p_outcome = 'sent' then
    perform cwr.mark_problem_alert_sent(v_run);
    perform cwr.touch_health_check('problem_alerts', true, null, v_run.tenant_id);
  elsif p_outcome = 'not_sent' then
    delete from cwr.problem_alert_runs where id = v_run.id;
    perform cwr.touch_health_check('problem_alerts', false, 'Email sending is not set up', v_run.tenant_id);
  elsif p_outcome = 'refused' then
    perform cwr.abandon_problem_alert(v_run, 'emails_refused');
    perform cwr.touch_health_check('problem_alerts', false, 'Every problem-alert email was refused', v_run.tenant_id);
  elsif v_run.attempts + 1 >= 6 then
    perform cwr.abandon_problem_alert(v_run, 'retries_exhausted');
    perform cwr.touch_health_check('problem_alerts', false, 'Problem-alert emails kept failing', v_run.tenant_id);
  else
    update cwr.problem_alert_runs set attempts = attempts + 1, claimed_at = null where id = v_run.id;
    perform cwr.touch_health_check('problem_alerts', false, 'A problem-alert email failed and will be retried', v_run.tenant_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Database watchdog (pg_cron, every 15 minutes): failed or stuck scheduled jobs, and
-- background checks that stopped running or keep failing, become critical problems.
-- ---------------------------------------------------------------------------

create function cwr.record_database_problem(p_tenant_id uuid, p_event jsonb)
returns void
language sql
set search_path = ''
as $$
  select cwr.record_problem(jsonb_build_object('tenant_id', p_tenant_id, 'origin', 'database', 'severity', 'critical') || p_event);
$$;

create function cwr.check_scheduled_job_runs(p_tenant_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_watermark bigint;
  v_run record;
begin
  select coalesce(last_runid, 0) into v_watermark from cwr.health_checks where tenant_id = p_tenant_id and name = 'scheduled_jobs';
  for v_run in
    select d.runid, j.jobname, d.status, d.return_message
    from cron.job_run_details d
    join cron.job j on j.jobid = d.jobid
    where j.jobname like 'cwr\_%' and d.runid > v_watermark
      and (d.status = 'failed' or (d.status in ('starting', 'running') and d.start_time < now() - interval '30 minutes'))
  loop
    -- The id is derived from the run, so reading the same run again records nothing new.
    perform cwr.record_database_problem(p_tenant_id, jsonb_build_object(
      'id', extensions.uuid_generate_v5(extensions.uuid_ns_oid(), concat_ws('|', p_tenant_id, v_run.runid, v_run.status)),
      'action', 'database.scheduled_job', 'stage', 'job', 'code', v_run.status,
      'detail', v_run.jobname || ': ' || left(coalesce(v_run.return_message, ''), 300)));
  end loop;
  -- Unfinished runs are read again next time, so a later failure is still caught.
  update cwr.health_checks
  set last_runid = coalesce(
    (select min(d.runid) - 1 from cron.job_run_details d where d.runid > v_watermark and d.status in ('starting', 'running')),
    (select max(d.runid) from cron.job_run_details d where d.runid > v_watermark),
    v_watermark)
  where tenant_id = p_tenant_id and name = 'scheduled_jobs';
end;
$$;

create function cwr.check_stale_health(p_tenant_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_check cwr.health_checks;
begin
  for v_check in select * from cwr.health_checks where tenant_id = p_tenant_id loop
    if v_check.name = 'problem_alerts' and v_check.last_run_at < now() - interval '20 minutes' then
      perform cwr.record_database_problem(p_tenant_id, jsonb_build_object('action', 'database.health_check', 'stage', 'setup', 'code', 'problem_alerts_stale',
        'detail', 'The problem-alert sender has not run for over 20 minutes.'));
    end if;
    if v_check.name = 'photo_cleanup' and coalesce(v_check.last_ok_at, v_check.created_at) < now() - interval '36 hours' then
      perform cwr.record_database_problem(p_tenant_id, jsonb_build_object('action', 'database.health_check', 'stage', 'setup', 'code', 'photo_cleanup_stale',
        'detail', 'The nightly photo clean-up has not finished for over 36 hours.'));
    end if;
    if v_check.name in ('problem_log_writes', 'problem_alerts') and v_check.last_error_at > coalesce(v_check.last_ok_at, '-infinity') then
      perform cwr.record_database_problem(p_tenant_id, jsonb_build_object('action', 'database.health_check', 'stage', 'setup', 'code', v_check.name || '_failing',
        'detail', v_check.last_error));
    end if;
  end loop;
end;
$$;

create function cwr.check_scheduled_jobs()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
begin
  for v_tenant_id in select distinct tenant_id from cwr.health_checks loop
    perform cwr.check_scheduled_job_runs(v_tenant_id);
    perform cwr.check_stale_health(v_tenant_id);
    perform cwr.touch_health_check('scheduled_jobs', true, null, v_tenant_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Retention: problems are kept 1 year (owner decision D3).
-- ---------------------------------------------------------------------------

create function cwr.purge_expired_problems()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('cwr.retention_purge', 'on', true);
  delete from cwr.problem_events where occurred_at < now() - interval '1 year';
  perform set_config('cwr.retention_purge', 'off', true);
  delete from cwr.problem_groups where last_seen_at < now() - interval '1 year';
  delete from cwr.problem_alert_runs where created_at < now() - interval '1 year';
end;
$$;

select cron.schedule('cwr_check_scheduled_jobs', '*/15 * * * *', 'select cwr.check_scheduled_jobs()');
select cron.schedule('cwr_purge_problems', '50 3 * * *', 'select cwr.purge_expired_problems()');

-- ---------------------------------------------------------------------------
-- Access: owners read; only the functions above write.
-- ---------------------------------------------------------------------------

alter table cwr.problem_catalog enable row level security;
alter table cwr.problem_events enable row level security;
alter table cwr.problem_groups enable row level security;
alter table cwr.problem_alert_runs enable row level security;
alter table cwr.health_checks enable row level security;

create policy "Owners read the problem catalog"
  on cwr.problem_catalog for select to authenticated
  using (exists (select 1 from cwr.owner_tenant_ids()));
create policy "Owners read their tenant's problems"
  on cwr.problem_events for select to authenticated
  using (tenant_id in (select cwr.owner_tenant_ids()));
create policy "Owners read their tenant's problem groups"
  on cwr.problem_groups for select to authenticated
  using (tenant_id in (select cwr.owner_tenant_ids()));
create policy "Owners read their tenant's problem alerts"
  on cwr.problem_alert_runs for select to authenticated
  using (tenant_id in (select cwr.owner_tenant_ids()));
create policy "Owners read their tenant's health checks"
  on cwr.health_checks for select to authenticated
  using (tenant_id in (select cwr.owner_tenant_ids()));

revoke all on cwr.problem_catalog, cwr.problem_events, cwr.problem_groups, cwr.problem_alert_runs, cwr.health_checks
  from anon, authenticated, service_role;
grant select on cwr.problem_catalog, cwr.problem_events, cwr.problem_groups, cwr.problem_alert_runs, cwr.health_checks
  to authenticated, service_role;

revoke execute on function
  cwr.prevent_problem_event_change(),
  cwr.guard_problem_alert_recipient(),
  cwr.get_severity_rank(text),
  cwr.get_scrubbed_text(text, integer),
  cwr.get_default_tenant_id(),
  cwr.get_problem_reference(),
  cwr.touch_heartbeat(text, uuid),
  cwr.touch_health_check(text, boolean, text, uuid),
  cwr.get_problem_bucket_limit(text, text),
  cwr.is_problem_flood(cwr.problem_events),
  cwr.is_problem_spike(cwr.problem_events),
  cwr.get_normalized_problem(jsonb),
  cwr.insert_problem_event(cwr.problem_events),
  cwr.count_problem_in_group(cwr.problem_events, boolean),
  cwr.record_problem(jsonb),
  cwr.is_problem_alert_backing_off(uuid),
  cwr.get_problem_alert_payload(cwr.problem_alert_runs),
  cwr.create_problem_alert_run(uuid, integer),
  cwr.claim_problem_alerts(uuid, integer),
  cwr.mark_problem_alert_sent(cwr.problem_alert_runs),
  cwr.abandon_problem_alert(cwr.problem_alert_runs, text),
  cwr.finish_problem_alerts(uuid, text),
  cwr.record_database_problem(uuid, jsonb),
  cwr.check_scheduled_job_runs(uuid),
  cwr.check_stale_health(uuid),
  cwr.check_scheduled_jobs(),
  cwr.purge_expired_problems()
from public, anon, authenticated;

grant execute on function
  cwr.record_problem(jsonb),
  cwr.touch_heartbeat(text, uuid),
  cwr.touch_health_check(text, boolean, text, uuid),
  cwr.claim_problem_alerts(uuid, integer),
  cwr.finish_problem_alerts(uuid, text)
to service_role;

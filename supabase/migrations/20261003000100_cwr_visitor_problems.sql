-- Website visitors in the problem log, and the owner's chat assistant switch
-- (docs/cwr-reliability-round-plan.md, Phase 1; decision D5 of docs/cwr-error-tracking-plan.md).
--
-- Visitors are never signed in, so their problems get their own origins:
--   server_visitor  — recorded by the site's server code (forms, chat, the Quick Check);
--   browser_visitor — sent by a visitor's browser: untrusted, capped at warning, no free text.
-- Visitor problems are flood-capped per (origin, action, severity band), and never share the
-- bucket that keeps server-side errors from members, jobs and the database flowing, so a
-- noisy visitor action can't hide anything else. Every other origin behaves exactly as before.

-- ---------------------------------------------------------------------------
-- Origins
-- ---------------------------------------------------------------------------

alter table cwr.problem_events drop constraint problem_events_origin_check;
alter table cwr.problem_events add constraint problem_events_origin_check check (
  origin in ('server_member', 'server_signin', 'browser_member', 'browser_signin', 'job', 'database', 'github', 'server_visitor', 'browser_visitor')
);

-- ---------------------------------------------------------------------------
-- Flood control
-- ---------------------------------------------------------------------------

create or replace function cwr.is_visitor_origin(p_origin text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_origin in ('server_visitor', 'browser_visitor');
$$;

create or replace function cwr.get_problem_bucket_limit(p_origin text, p_severity text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_origin = 'server_visitor' then 60
    when p_origin = 'browser_visitor' then 20
    when cwr.get_severity_rank(p_severity) >= 3 and p_origin not like 'browser_%' then 300
    when p_origin in ('server_member', 'browser_member') then 30
    when p_origin = 'server_signin' then 60
    when p_origin = 'browser_signin' then 30
    else 120
  end;
$$;

create or replace function cwr.is_problem_flood(p_event cwr.problem_events)
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
      when cwr.is_visitor_origin(p_event.origin)
        then e.origin = p_event.origin and e.action = p_event.action
          and (cwr.get_severity_rank(e.severity) >= 3) = (cwr.get_severity_rank(p_event.severity) >= 3)
      when cwr.get_severity_rank(p_event.severity) >= 3 and p_event.origin not like 'browser_%'
        then cwr.get_severity_rank(e.severity) >= 3 and e.origin not like 'browser_%' and not cwr.is_visitor_origin(e.origin)
      when p_event.origin in ('server_member', 'browser_member')
        then e.actor_id is not distinct from p_event.actor_id and e.origin in ('server_member', 'browser_member')
      else e.origin = p_event.origin
    end;
$$;

-- Same as before (20260928000200) except the two visitor origins are accepted and a
-- visitor's browser report is capped at warning, like one from a sign-in page.
create or replace function cwr.get_normalized_problem(p jsonb)
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
  v_event.origin := case when p ->> 'origin' in ('server_member', 'server_signin', 'browser_member', 'browser_signin', 'job', 'database', 'github', 'server_visitor', 'browser_visitor') then p ->> 'origin' else 'job' end;
  v_event.action := coalesce(v_catalog.action, 'unknown.unknown');
  v_event.area := coalesce(v_catalog.area, 'unknown');
  v_event.stage := case when p ->> 'stage' in ('validate', 'rule', 'not_found', 'access', 'duplicate', 'database', 'storage', 'browser', 'network', 'external', 'load', 'auth', 'job', 'unexpected', 'setup') then p ->> 'stage' else 'unexpected' end;
  v_event.severity := case when p ->> 'severity' in ('info', 'warning', 'error', 'critical') then p ->> 'severity' else 'error' end;
  if v_event.origin in ('browser_signin', 'browser_visitor') and cwr.get_severity_rank(v_event.severity) > 2 then
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

revoke execute on function cwr.is_visitor_origin(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Catalog (mirrors src/lib/observability/problem-catalog.ts; CI compares the two)
-- ---------------------------------------------------------------------------

insert into cwr.problem_catalog (action, area, label, section_label, spike_codes) values
  ('site.contact_form', 'site', 'Send the contact form', 'Website visitors', '{}'),
  ('site.booking_form', 'site', 'Send the TouchUp request form', 'Website visitors', '{}'),
  ('site.bot_check', 'site', 'Check a visitor with the Quick Check', 'Website visitors', '{}'),
  ('site.bot_check_widget', 'site', 'Load the Quick Check', 'Website visitors', '{}'),
  ('site.chat_message', 'site', 'Send a chat message', 'Website visitors', '{}'),
  ('site.chat_assistant', 'site', 'Get a chat assistant reply', 'Website visitors', '{}'),
  ('site.chat_handoff', 'site', 'Ask for a person from the chat', 'Website visitors', '{}'),
  ('site.chat_widget', 'site', 'Use the chat window', 'Website visitors', '{}'),
  ('site.listing_photo', 'site', 'Show a listing photo', 'Website visitors', '{}'),
  ('chat_policy.set_assistant', 'chat_policy', 'Turn the chat assistant on or off', 'Chat policy', '{}');

-- ---------------------------------------------------------------------------
-- Chat assistant on/off (owners only; decision D4)
-- ---------------------------------------------------------------------------

alter table cwr.site_settings add column is_assistant_on boolean not null default true;

-- Managers may edit contact details on the same row (insert or update), so the switch is
-- guarded here rather than by grants: only an owner of the tenant, or server-side work, may
-- change it. A new row may only start switched on.
create function cwr.guard_assistant_switch()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if cwr.is_service_context() then
    return new;
  end if;
  if tg_op = 'INSERT' and new.is_assistant_on then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.is_assistant_on is not distinct from old.is_assistant_on then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.tenant_id in (select cwr.owner_tenant_ids()) then
    return new;
  end if;
  raise exception 'Only owners can turn the chat assistant on or off' using errcode = 'insufficient_privilege';
end;
$$;

create trigger site_settings_guard_assistant_switch
  before insert or update on cwr.site_settings
  for each row execute function cwr.guard_assistant_switch();

revoke execute on function cwr.guard_assistant_switch() from public, anon, authenticated;

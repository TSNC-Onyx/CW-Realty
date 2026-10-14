-- Error logging A-grade round (docs/error-logging-a-grade-plan.md; owner approved 2026-10-10):
-- public-site crash and browser-error actions, the Problems page actions, crash grouping by
-- what went wrong, stack locations kept readable through scrubbing, and owners marking a
-- problem group resolved.

-- ---------------------------------------------------------------------------
-- Catalog (mirrors src/lib/observability/problem-catalog.ts; CI compares the two)
-- ---------------------------------------------------------------------------

insert into cwr.problem_catalog (action, area, label, section_label, spike_codes) values
  ('site.page_crash', 'site', 'Open a website page', 'Website visitors', '{}'),
  ('site.browser_error', 'site', 'Browser error on a website page', 'Website visitors', '{}'),
  ('problems.load', 'problems', 'Load problems', 'Problems', '{}'),
  ('problems.resolve', 'problems', 'Mark a problem resolved', 'Problems', '{}'),
  ('problems.show_trace', 'problems', 'Show a problem''s code location', 'Problems', '{}');

-- The private "source-maps" bucket is not created here (protected schema): supabase/config.toml
-- makes it locally, and scripts/store-source-maps.mjs creates it, private, on first use.

-- ---------------------------------------------------------------------------
-- Scrubbing that keeps a stack line's "file:line:column" (scrubbing long numbers there made
-- traces unreadable), minus any query string in it; the rest of every line is scrubbed as
-- before. Mirrors getScrubbedDetail in src/lib/observability/scrub.ts.
-- ---------------------------------------------------------------------------

create function cwr.get_scrubbed_detail(p_text text, p_max_length integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(string_agg(
    case
      when m is null then coalesce(cwr.get_scrubbed_text(line, 2000), '')
      else coalesce(cwr.get_scrubbed_text(m[1], 2000), '') || regexp_replace(m[2], '\?[^:]*(:[0-9]+:[0-9]+)$', '\1') || m[3]
    end,
    E'\n' order by ordinality), p_max_length)
  from regexp_split_to_table(p_text, E'\n') with ordinality as lines(line, ordinality)
  cross join lateral (select regexp_match(line, '^(.*?)((?:[a-z][a-z0-9+.-]*://)?[^[:space:]()]+:[0-9]+:[0-9]+)(\)?)[[:space:]]*$') as m) frame;
$$;

-- Same as 20261003000100 except: the detail keeps stack locations (get_scrubbed_detail), and a
-- crash's group key (its first message line, cleaned and scrubbed by
-- src/lib/observability/group-key.ts) joins the fingerprint, so different bugs of the same
-- kind are grouped apart. Problems without a group key keep their existing groups.
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
  v_event.detail := cwr.get_scrubbed_detail(
    case when v_catalog.action is null then 'Unlisted action: ' || left(coalesce(p ->> 'action', ''), 80) || '. ' else '' end || coalesce(p ->> 'detail', ''),
    2000);
  v_event.fingerprint := left(encode(sha256(convert_to(concat_ws('|', v_event.area, v_event.action, v_event.stage, v_event.code, nullif(left(p ->> 'group_key', 200), '')), 'UTF8')), 'hex'), 32);
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

-- ---------------------------------------------------------------------------
-- Mark resolved (Problems page; docs/cwr-error-tracking-plan.md "Resolve", decision D2:
-- owners only). The owner check is the real control: the function runs as its owner, so the
-- workflow role list passes. The status change is still logged as a transition.
-- ---------------------------------------------------------------------------

create function cwr.resolve_problem_group(p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from cwr.problem_groups where id = p_id;
  if v_tenant_id is null or v_tenant_id not in (select cwr.owner_tenant_ids()) then
    raise exception 'Only an owner can resolve this problem' using errcode = 'insufficient_privilege';
  end if;
  update cwr.problem_groups
  set resolved_by = auth.uid(), resolution_note = nullif(left(btrim(coalesce(p_note, '')), 1000), ''), updated_at = now()
  where id = p_id;
  perform cwr.transition('problem_status', p_id, 'resolved');
end;
$$;

revoke execute on function cwr.get_scrubbed_detail(text, integer) from public, anon, authenticated;
revoke execute on function cwr.resolve_problem_group(uuid, text) from public, anon;
grant execute on function cwr.resolve_problem_group(uuid, text) to authenticated;

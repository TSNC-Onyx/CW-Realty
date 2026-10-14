-- Website visitors in the problem log and the owner's chat assistant switch
-- (docs/cwr-reliability-round-plan.md, Phase 1).
begin;
select plan(19);
select cwr_test.create_fixture();

create function pg_temp.record(p_event jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_event jsonb := jsonb_build_object('tenant_id', cwr_test.id('tenant_a')) || p_event;
  v_result jsonb;
begin
  set local role service_role;
  v_result := cwr.record_problem(v_event);
  reset role;
  return v_result;
end;
$$;

create function pg_temp.record_many(p_event jsonb, p_count integer)
returns void
language sql
as $$
  select pg_temp.record(p_event) from generate_series(1, p_count);
$$;

create function pg_temp.visitor(p_origin text, p_action text, p_severity text)
returns jsonb
language sql
as $$
  select jsonb_build_object('origin', p_origin, 'action', p_action, 'stage', 'browser', 'severity', p_severity, 'code', 'test');
$$;

-- Origins -------------------------------------------------------------------

create temp table server_report as select pg_temp.record(pg_temp.visitor('server_visitor', 'site.bot_check', 'info')) as result;
create temp table browser_report as select pg_temp.record(pg_temp.visitor('browser_visitor', 'site.chat_widget', 'critical')) as result;

select is(
  (select e.origin from cwr.problem_events e, server_report r where e.reference = r.result ->> 'reference'),
  'server_visitor',
  'A problem from the site''s server code is stored as a website visitor''s'
);

select is(
  (select e.severity from cwr.problem_events e, browser_report r where e.reference = r.result ->> 'reference'),
  'warning',
  'A visitor''s browser can never report worse than a warning'
);

-- Flood control ---------------------------------------------------------------

select pg_temp.record_many(pg_temp.visitor('browser_visitor', 'site.listing_photo', 'warning'), 20);
select is(
  (pg_temp.record(pg_temp.visitor('browser_visitor', 'site.listing_photo', 'warning')) ->> 'suppressed')::boolean,
  true,
  'Visitor browser reports stop at 20 a minute for one action'
);
select is(
  (pg_temp.record(pg_temp.visitor('browser_visitor', 'site.bot_check_widget', 'warning')) ->> 'suppressed')::boolean,
  false,
  'A flood on one visitor action does not hide another'
);

select pg_temp.record_many(pg_temp.visitor('server_visitor', 'site.contact_form', 'info'), 60);
select is(
  (pg_temp.record(pg_temp.visitor('server_visitor', 'site.contact_form', 'info')) ->> 'suppressed')::boolean,
  true,
  'Visitor server records stop at 60 a minute for one action and severity band'
);
select is(
  (pg_temp.record(pg_temp.visitor('server_visitor', 'site.contact_form', 'critical')) ->> 'suppressed')::boolean,
  false,
  'Bot noise on an action never hides a critical record for it'
);

select pg_temp.record_many(pg_temp.visitor('server_visitor', action, 'critical'), 60)
from unnest(array['site.booking_form', 'site.chat_message', 'site.chat_assistant', 'site.chat_handoff', 'site.bot_check']) as action;
select is(
  (pg_temp.record(jsonb_build_object('origin', 'job', 'action', 'jobs.alert_email', 'stage', 'job', 'severity', 'critical', 'code', 'test')) ->> 'suppressed')::boolean,
  false,
  'Visitor criticals never use up the bucket that keeps the team''s and jobs'' errors flowing'
);

select results_eq(
  $$ select cwr.get_problem_bucket_limit(o, s)
     from (values ('server_member', 'info'), ('server_member', 'error'), ('browser_member', 'info'), ('browser_member', 'critical'),
                  ('server_signin', 'info'), ('server_signin', 'critical'), ('browser_signin', 'warning'), ('job', 'info'),
                  ('job', 'error'), ('database', 'critical'), ('github', 'info')) as t(o, s) $$,
  $$ values (30), (300), (30), (30), (60), (300), (30), (120), (300), (300), (120) $$,
  'Every existing origin keeps exactly the flood limits it had before'
);

select is(
  (select count(*)::integer from cwr.problem_catalog where (area = 'site' and action not in ('site.page_crash', 'site.browser_error')) or action = 'chat_policy.set_assistant'),
  10,
  'The catalog lists the nine visitor actions and the assistant switch'
);

-- Who can read visitor problems -----------------------------------------------------

select cwr_test.sign_in('owner');
set local role authenticated;
select isnt_empty(
  $$ select 1 from cwr.problem_events where origin = 'server_visitor' $$,
  'Owners can read website visitors'' problems'
);
reset role;

select cwr_test.sign_in('manager');
set local role authenticated;
select is_empty(
  $$ select 1 from cwr.problem_events where origin = 'server_visitor' $$,
  'Managers cannot read the problem log'
);
reset role;

-- Chat assistant switch (owners only) ----------------------------------------------

select cwr_test.sign_in('manager');
set local role authenticated;
select throws_ok(
  $$ insert into cwr.site_settings (tenant_id, phone, email, is_assistant_on)
     values (cwr_test.id('tenant_a'), '+13365550100', 'office@example.com', false) $$,
  '42501',
  null,
  'A manager cannot add settings with the assistant switched off'
);
select lives_ok(
  $$ insert into cwr.site_settings (tenant_id, phone, email) values (cwr_test.id('tenant_a'), '+13365550100', 'office@example.com') $$,
  'A manager can add contact settings, which start with the assistant on'
);
select lives_ok(
  $$ update cwr.site_settings set email = 'front@example.com' where tenant_id = cwr_test.id('tenant_a') $$,
  'A manager can still change contact details'
);
select throws_ok(
  $$ update cwr.site_settings set is_assistant_on = false where tenant_id = cwr_test.id('tenant_a') $$,
  '42501',
  null,
  'A manager cannot turn the assistant off'
);
select throws_ok(
  $$ insert into cwr.site_settings (tenant_id, phone, email, is_assistant_on)
     values (cwr_test.id('tenant_a'), '+13365550100', 'office@example.com', false)
     on conflict (tenant_id) do update set is_assistant_on = excluded.is_assistant_on $$,
  '42501',
  null,
  'A manager cannot turn the assistant off with an upsert either'
);
reset role;

select cwr_test.sign_in('owner');
set local role authenticated;
select lives_ok(
  $$ update cwr.site_settings set is_assistant_on = false where tenant_id = cwr_test.id('tenant_a') $$,
  'An owner can turn the assistant off'
);
reset role;

select cwr_test.sign_out();
set local role anon;
select throws_ok(
  $$ update cwr.site_settings set is_assistant_on = true where tenant_id = cwr_test.id('tenant_a') $$,
  '42501',
  null,
  'A visitor cannot touch the switch'
);
reset role;

set local role service_role;
select lives_ok(
  $$ update cwr.site_settings set is_assistant_on = true where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'Server-side work (imports, the service role) can set the switch'
);
reset role;

select * from finish();
rollback;

-- Error logging A-grade round (docs/error-logging-a-grade-plan.md): new catalog actions, the
-- private source-map bucket, stack locations kept through scrubbing, crash grouping by group
-- key, and owners-only "Mark resolved".
begin;
select plan(13);
select cwr_test.create_fixture();

-- Records one problem for tenant A as the server (service role) and returns its group.
create function pg_temp.record_group(p_event jsonb)
returns uuid
language plpgsql
as $$
declare
  v_event jsonb := jsonb_build_object('tenant_id', cwr_test.id('tenant_a')) || p_event;
  v_reference text;
begin
  set local role service_role;
  v_reference := cwr.record_problem(v_event) ->> 'reference';
  reset role;
  return (select g.id from cwr.problem_groups g join cwr.problem_events e on e.fingerprint = g.fingerprint and e.tenant_id = g.tenant_id where e.reference = v_reference);
end;
$$;

select ok(
  (select count(*) = 5 from cwr.problem_catalog where action in ('site.page_crash', 'site.browser_error', 'problems.load', 'problems.resolve', 'problems.show_trace')),
  'The new actions are in the catalog'
);

select is((select public from storage.buckets where id = 'source-maps'), false, 'The source-map bucket is private');
select cwr_test.sign_in('owner');
set local role authenticated;
select is_empty($$ select 1 from storage.objects where bucket_id = 'source-maps' $$, 'Signed-in people cannot list source maps');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('source-maps', 'x/browser.json.gz') $$,
  '42501', null, 'Signed-in people cannot add source maps'
);
reset role;
select cwr_test.sign_out();
set local role anon;
select is_empty($$ select 1 from storage.objects where bucket_id = 'source-maps' $$, 'Visitors cannot list source maps');
reset role;

select is(
  cwr.get_scrubbed_detail(E'Failed for jo@example.com\nat a (https://x.com/_next/static/chunks/0f3a.js:1:1048576)', 2000),
  E'Failed for [email]\nat a (https://x.com/_next/static/chunks/0f3a.js:1:1048576)',
  'Scrubbing keeps a stack line''s line and column but still scrubs the message'
);

select is(
  cwr.get_scrubbed_detail('at a (https://x.com/admin/x.js?email=jo@example.com:1:2)', 2000),
  'at a (https://x.com/admin/x.js:1:2)',
  'Scrubbing drops a query string inside a code location'
);

select is(
  pg_temp.record_group('{"origin":"server_member","action":"portal.page_crash","stage":"unexpected","severity":"error","code":"TypeError","group_key":"x.map is not a function"}'),
  pg_temp.record_group('{"origin":"server_member","action":"portal.page_crash","stage":"unexpected","severity":"error","code":"TypeError","group_key":"x.map is not a function"}'),
  'The same crash twice is one group'
);
select isnt(
  pg_temp.record_group('{"origin":"server_member","action":"portal.page_crash","stage":"unexpected","severity":"error","code":"TypeError","group_key":"x.map is not a function"}'),
  pg_temp.record_group('{"origin":"server_member","action":"portal.page_crash","stage":"unexpected","severity":"error","code":"TypeError","group_key":"Cannot read properties of null"}'),
  'Two different crashes of the same kind are two groups'
);

create temp table crash_group as
  select pg_temp.record_group('{"origin":"server_member","action":"portal.page_crash","stage":"unexpected","severity":"error","code":"RangeError","group_key":"Invalid time value"}') as id;
grant select on crash_group to authenticated;

select cwr_test.sign_in('manager');
set local role authenticated;
select throws_ok(
  $$ select cwr.resolve_problem_group((select id from crash_group), 'fixed') $$,
  '42501', null, 'A manager cannot resolve a problem'
);
reset role;

select cwr_test.sign_in('outsider');
set local role authenticated;
select throws_ok(
  $$ select cwr.resolve_problem_group((select id from crash_group), 'fixed') $$,
  '42501', null, 'An owner of another business cannot resolve this problem'
);
reset role;

select cwr_test.sign_in('owner');
set local role authenticated;
select cwr.resolve_problem_group((select id from crash_group), '  Fixed the date format  ');
reset role;
select is(
  (select status || ' / ' || resolution_note from cwr.problem_groups where id = (select id from crash_group)),
  'resolved / Fixed the date format',
  'An owner resolves a problem with a note'
);
select ok(
  exists (select 1 from cwr.audit_log where table_name = 'problem_groups' and record_id = (select id from crash_group) and action = 'transition'),
  'Resolving is logged as a status change'
);

select * from finish();
rollback;

-- Chat policy tests in batches: jobs and their insert-only parts
-- (docs/cwr-chat-policy-test-batches-plan.md, Part A).
begin;
select plan(13);
select cwr_test.create_fixture();

insert into cwr.chat_policy_test_jobs (run_key, tenant_id, policy_id, policy_updated_at, test_ids, batch_size, batch_count, created_by)
values (
  'f1000000-0000-0000-0000-000000000001',
  cwr_test.id('tenant_a'),
  cwr_test.id('draft_policy'),
  now(),
  '{}',
  8,
  2,
  cwr_test.id('owner')
);

-- ---------------------------------------------------------------- the server writes parts once
-- (literal ids below: service_role can't call the cwr_test helpers)
set local role service_role;
select lives_ok(
  $$ insert into cwr.chat_policy_test_parts (run_key, batch_index, results)
     values ('f1000000-0000-0000-0000-000000000001', 0, '[]'::jsonb) $$,
  'The server saves a finished batch'
);
select throws_ok(
  $$ insert into cwr.chat_policy_test_parts (run_key, batch_index, results)
     values ('f1000000-0000-0000-0000-000000000001', 0, '[]'::jsonb) $$,
  '23505',
  null,
  'A batch that runs twice is refused, never overwritten'
);
select throws_ok(
  $$ update cwr.chat_policy_test_parts set results = '[{"isPassed": true}]'::jsonb
     where run_key = 'f1000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'A saved batch cannot be changed'
);
select throws_ok(
  $$ insert into cwr.chat_policy_test_parts (run_key, batch_index, results)
     values ('f1000000-0000-0000-0000-000000000001', 1, '{}'::jsonb) $$,
  '23514',
  null,
  'Batch results must be a list'
);
select throws_ok(
  $$ insert into cwr.chat_policy_test_parts (run_key, batch_index, results)
     values ('f1000000-0000-0000-0000-000000000001', -1, '[]'::jsonb) $$,
  '23514',
  null,
  'A batch number cannot be negative'
);
select throws_ok(
  $$ insert into cwr.chat_policy_test_jobs (tenant_id, policy_id, policy_updated_at, test_ids, batch_size, batch_count, created_by)
     values ('bbbbbbbb-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', now(), '{}', 8, 1, '11111111-1111-1111-1111-111111111111') $$,
  '23503',
  null,
  'A job must name a policy of its own tenant'
);

-- ---------------------------------------------------------------- nobody signed in can see or write jobs
reset role;
select cwr_test.sign_in('owner');
set local role authenticated;
select throws_ok(
  $$ select 1 from cwr.chat_policy_test_jobs $$,
  '42501',
  null,
  'Even owners cannot read test jobs from the browser'
);
select throws_ok(
  $$ insert into cwr.chat_policy_test_parts (run_key, batch_index, results)
     values ('f1000000-0000-0000-0000-000000000001', 1, '[]'::jsonb) $$,
  '42501',
  null,
  'Even owners cannot save a batch from the browser'
);

select throws_ok(
  $$ insert into cwr.chat_policy_test_jobs (tenant_id, policy_id, policy_updated_at, test_ids, batch_size, batch_count, created_by)
     values (cwr_test.id('tenant_a'), cwr_test.id('draft_policy'), now(), '{}', 8, 1, cwr_test.id('owner')) $$,
  '42501',
  null,
  'Even owners cannot start a job from the browser'
);
select throws_ok(
  $$ select 1 from cwr.chat_policy_test_parts $$,
  '42501',
  null,
  'Even owners cannot read test parts from the browser'
);

reset role;
select cwr_test.sign_in('manager');
set local role authenticated;
select throws_ok(
  $$ select 1 from cwr.chat_policy_test_jobs $$,
  '42501',
  null,
  'Managers cannot read test jobs'
);

reset role;
select cwr_test.sign_out();
set local role anon;
select throws_ok(
  $$ select 1 from cwr.chat_policy_test_parts $$,
  '42501',
  null,
  'Visitors cannot read test parts'
);

-- ---------------------------------------------------------------- finishing removes the parts
reset role;
set local role service_role;
delete from cwr.chat_policy_test_jobs where run_key = 'f1000000-0000-0000-0000-000000000001';
select is_empty(
  $$ select 1 from cwr.chat_policy_test_parts where run_key = 'f1000000-0000-0000-0000-000000000001' $$,
  'Deleting a job deletes its parts'
);

select * from finish();
rollback;

-- Chat assistant: reply outcomes and the guarded test-run recorder.
begin;
select plan(12);
select cwr_test.create_fixture();

-- ---------------------------------------------------------------- reply outcomes
insert into cwr.chat_sessions (id, tenant_id) values ('f0000000-0000-0000-0000-000000000001', cwr_test.id('tenant_a'));
select lives_ok(
  $$ insert into cwr.chat_messages (tenant_id, session_id, role, body, outcome)
     values (cwr_test.id('tenant_a'), 'f0000000-0000-0000-0000-000000000001', 'assistant', 'A person will help.', 'handoff') $$,
  'Assistant replies record their outcome'
);
select throws_ok(
  $$ insert into cwr.chat_messages (tenant_id, session_id, role, body, outcome)
     values (cwr_test.id('tenant_a'), 'f0000000-0000-0000-0000-000000000001', 'visitor', 'Hi', 'answer') $$,
  '23514',
  null,
  'Visitor messages carry no outcome'
);

-- ---------------------------------------------------------------- test-run recorder
select lives_ok(
  format(
    $$ select cwr.record_chat_policy_test_run(%L, %L, null, true, '[]'::jsonb, %L) $$,
    cwr_test.id('draft_policy'),
    (select updated_at from cwr.chat_policies where id = cwr_test.id('draft_policy')),
    cwr_test.id('owner')
  ),
  'The server records a run for the unchanged draft'
);
select throws_ok(
  format(
    $$ select cwr.record_chat_policy_test_run(%L, %L, null, true, '[]'::jsonb, null) $$,
    cwr_test.id('draft_policy'),
    '2000-01-01T00:00:00Z'
  ),
  '23514',
  'The draft changed while the tests ran; run them again',
  'A run is refused when the draft was edited while it ran'
);

insert into cwr.chat_policy_tests (tenant_id, question, expected_outcome)
values (cwr_test.id('tenant_a'), 'How do I book a TouchUp?', 'answer');
select throws_ok(
  format(
    $$ select cwr.record_chat_policy_test_run(%L, %L, null, true, '[]'::jsonb, null) $$,
    cwr_test.id('draft_policy'),
    (select updated_at from cwr.chat_policies where id = cwr_test.id('draft_policy'))
  ),
  '23514',
  'The test questions changed while the tests ran; run them again',
  'A run is refused when a test question was added while it ran'
);

insert into cwr.chat_policy_test_runs (tenant_id, policy_id, is_passed, policy_updated_at, tests_updated_at)
values (cwr_test.id('tenant_a'), cwr_test.id('draft_policy'), true, '2000-01-01T00:00:00Z',
        (select max(updated_at) from cwr.chat_policy_tests where tenant_id = cwr_test.id('tenant_a')));
select throws_ok(
  $$ select cwr.transition('chat_policy_status', cwr_test.id('draft_policy'), 'published') $$,
  '23514',
  'Run the policy tests and pass them before publishing',
  'A passing run for a different save of the draft does not allow publishing'
);

select lives_ok(
  format(
    $$ select cwr.record_chat_policy_test_run(%L, %L, %L, true, '[]'::jsonb, null) $$,
    cwr_test.id('draft_policy'),
    (select updated_at from cwr.chat_policies where id = cwr_test.id('draft_policy')),
    (select max(updated_at) from cwr.chat_policy_tests where tenant_id = cwr_test.id('tenant_a'))
  ),
  'A run of the current draft and questions is recorded'
);
select cwr.transition('chat_policy_status', cwr_test.id('draft_policy'), 'published');
select throws_ok(
  format(
    $$ select cwr.record_chat_policy_test_run(%L, %L, %L, true, '[]'::jsonb, null) $$,
    cwr_test.id('draft_policy'),
    (select updated_at from cwr.chat_policies where id = cwr_test.id('draft_policy')),
    (select max(updated_at) from cwr.chat_policy_tests where tenant_id = cwr_test.id('tenant_a'))
  ),
  '23514',
  'Only a draft can be tested',
  'Published versions are not re-tested'
);

select cwr_test.sign_in('owner');
set local role authenticated;
select throws_ok(
  format(
    $$ select cwr.record_chat_policy_test_run(%L, now(), null, true, '[]'::jsonb, null) $$,
    cwr_test.id('draft_policy')
  ),
  '42501',
  null,
  'Even owners cannot record a passing run from the browser'
);

reset role;
select cwr_test.sign_out();
set local role anon;
select throws_ok(
  format(
    $$ select cwr.record_chat_policy_test_run(%L, now(), null, true, '[]'::jsonb, null) $$,
    cwr_test.id('draft_policy')
  ),
  '42501',
  null,
  'Visitors cannot record a run'
);

reset role;
select cwr_test.sign_in('manager');
set local role authenticated;
select is(
  (select count(*)::int from cwr.chat_messages where outcome = 'handoff'),
  1,
  'Managers can review handed-off chats'
);

reset role;
select cwr_test.sign_in('staff');
set local role authenticated;
select is_empty($$ select 1 from cwr.chat_messages $$, 'Staff cannot read chat logs');

select * from finish();
rollback;

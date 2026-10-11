-- Sign-in code removals in the append-only audit log. The owner's reset button was retired on
-- 2026-10-09 (password-only sign-in); the one-time removal script logs as the system.
begin;
select plan(5);
select cwr_test.create_fixture();

select cwr_test.sign_in('owner');
set local role authenticated;
select throws_ok(
  $$ select cwr.record_sign_in_codes_reset(cwr_test.id('staff')) $$,
  '42501',
  null,
  'The retired reset button''s log function can no longer be called (2026-10-09)'
);
reset role;
select is(
  (select count(*)::int from cwr.audit_log where action = 'mfa_reset'),
  0,
  'Nothing was written'
);

reset role;
select cwr_test.sign_in('manager');
set local role authenticated;
select throws_ok(
  $$ select cwr.record_sign_in_codes_reset(cwr_test.id('staff')) $$,
  '42501',
  null,
  'Managers cannot call it either'
);

-- One-time removal at the switch to password-only sign-in (2026-10-09): the service role logs it.
reset role;
select set_config('cwr_test.manager_id', cwr_test.id('manager')::text, true);
set local role service_role;
select lives_ok(
  $$ select cwr.record_sign_in_codes_removed(current_setting('cwr_test.manager_id')::uuid) $$,
  'The removal script can record removing a member''s old sign-in codes'
);
reset role;
select cwr_test.sign_in('owner');
set local role authenticated;
select throws_ok(
  $$ select cwr.record_sign_in_codes_removed(cwr_test.id('staff')) $$,
  '42501',
  null,
  'Signed-in people cannot write system removal entries'
);

select * from finish();
rollback;

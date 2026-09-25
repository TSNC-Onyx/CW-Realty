-- Owners' sign-in code resets are written to the append-only audit log.
begin;
select plan(3);
select cwr_test.create_fixture();

select cwr_test.sign_in('owner');
set local role authenticated;
select lives_ok(
  $$ select cwr.record_sign_in_codes_reset(cwr_test.id('staff')) $$,
  'An owner can record resetting a team member''s sign-in codes'
);
select results_eq(
  $$ select action, actor_id, record_id from cwr.audit_log where action = 'mfa_reset' $$,
  $$ values ('mfa_reset', cwr_test.id('owner'), cwr_test.id('staff')) $$,
  'The entry says who reset whose codes'
);

reset role;
select cwr_test.sign_in('manager');
set local role authenticated;
select throws_ok(
  $$ select cwr.record_sign_in_codes_reset(cwr_test.id('staff')) $$,
  '42501',
  'Only an owner can record this for a member of their team',
  'Managers cannot write reset entries'
);

select * from finish();
rollback;

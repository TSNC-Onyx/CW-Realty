-- Health check recovery (docs/false-alarm-cleanup-plan.md #10): a success right after a failure
-- clears the "failing" state; successes are otherwise still stamped at most once a minute.
begin;
select plan(3);
select cwr_test.create_fixture();

select cwr.touch_health_check('problem_log_writes', true, null, cwr_test.id('tenant_a'));
create temp table first_ok as
  select last_ok_at from cwr.health_checks where tenant_id = cwr_test.id('tenant_a') and name = 'problem_log_writes';

select cwr.touch_health_check('problem_log_writes', true, null, cwr_test.id('tenant_a'));
select is(
  (select last_ok_at from cwr.health_checks where tenant_id = cwr_test.id('tenant_a') and name = 'problem_log_writes'),
  (select last_ok_at from first_ok),
  'A second success within a minute is not stamped again'
);

select cwr.touch_health_check('problem_log_writes', false, 'write failed', cwr_test.id('tenant_a'));
select ok(
  (select last_error_at > last_ok_at from cwr.health_checks where tenant_id = cwr_test.id('tenant_a') and name = 'problem_log_writes'),
  'A failure marks the check failing'
);

select cwr.touch_health_check('problem_log_writes', true, null, cwr_test.id('tenant_a'));
select ok(
  (select last_ok_at >= last_error_at from cwr.health_checks where tenant_id = cwr_test.id('tenant_a') and name = 'problem_log_writes'),
  'A success within the same minute after a failure clears it'
);

select * from finish();
rollback;

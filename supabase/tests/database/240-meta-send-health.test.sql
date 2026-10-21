-- Meta send health (docs/cwr-ads-analytics-fixes-plan.md, R6): the server records each lead sent
-- to Meta as the meta_conversions background check, and only owners can read it.
begin;
select plan(6);
select cwr_test.create_fixture();

select cwr.touch_health_check('meta_conversions', true, null, cwr_test.id('tenant_a'));
select isnt(
  (select last_ok_at from cwr.health_checks where tenant_id = cwr_test.id('tenant_a') and name = 'meta_conversions'),
  null,
  'The Meta check records a success'
);

select cwr.touch_health_check('meta_conversions', false, 'Meta answered 400 (code 190)', cwr_test.id('tenant_a'));
select ok(
  (select last_error_at > last_ok_at from cwr.health_checks where tenant_id = cwr_test.id('tenant_a') and name = 'meta_conversions'),
  'The Meta check records a failure'
);

select throws_ok(
  $$ select cwr.touch_health_check('not_a_check', true, null, cwr_test.id('tenant_a')) $$,
  '23514', null, 'Unknown check names are still refused'
);

select cwr_test.sign_in('owner');
set local role authenticated;
select is(
  (select count(*)::int from cwr.health_checks where name = 'meta_conversions'),
  1,
  'Owners can read the Meta check'
);
reset role;

select cwr_test.sign_in('manager');
set local role authenticated;
select is(
  (select count(*)::int from cwr.health_checks where name = 'meta_conversions'),
  0,
  'Managers can''t read the Meta check'
);
reset role;

select cwr_test.sign_out();
set local role anon;
select throws_ok(
  $$ select 1 from cwr.health_checks $$,
  '42501', null, 'Visitors can''t read background checks'
);
reset role;

select * from finish();
rollback;

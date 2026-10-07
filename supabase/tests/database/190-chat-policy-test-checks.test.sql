-- Chat test questions: the two optional checks default to today's grading.
begin;
select plan(4);
select cwr_test.create_fixture();

select col_default_is('cwr', 'chat_policy_tests', 'allows_friendly_reply', 'false', 'A question allows no friendly reply unless the owner says so');
select col_default_is('cwr', 'chat_policy_tests', 'must_mention', '{}', 'A question checks no phrases unless the owner adds them');

select lives_ok(
  $$ insert into cwr.chat_policy_tests (tenant_id, question, expected_outcome, must_mention)
     values (cwr_test.id('tenant_a'), 'How much is a consultation?', 'answer', array['$500', 'flat fee', 'consultation']) $$,
  'Up to three phrases are allowed'
);
select throws_ok(
  $$ insert into cwr.chat_policy_tests (tenant_id, question, expected_outcome, must_mention)
     values (cwr_test.id('tenant_a'), 'Too many?', 'answer', array['a', 'b', 'c', 'd']) $$,
  '23514',
  null,
  'More than three phrases are refused'
);

select * from finish();
rollback;

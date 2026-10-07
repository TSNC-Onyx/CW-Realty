-- Chat guided topics: every message says where it came from; typed is the default.
begin;
select plan(5);
select cwr_test.create_fixture();

insert into cwr.chat_sessions (id, tenant_id) values ('f0000000-0000-0000-0000-000000000002', cwr_test.id('tenant_a'));

select col_not_null('cwr', 'chat_messages', 'source', 'Every message has a source');
select col_default_is('cwr', 'chat_messages', 'source', 'typed', 'Messages written the old way count as typed');

insert into cwr.chat_messages (tenant_id, session_id, role, body)
  values (cwr_test.id('tenant_a'), 'f0000000-0000-0000-0000-000000000002', 'visitor', 'When are you open?');
select is(
  (select source::text from cwr.chat_messages where session_id = 'f0000000-0000-0000-0000-000000000002'),
  'typed',
  'An insert without a source is a typed question'
);

select throws_ok(
  $$ insert into cwr.chat_messages (tenant_id, session_id, role, body, source)
     values (cwr_test.id('tenant_a'), 'f0000000-0000-0000-0000-000000000002', 'visitor', 'Hi', 'pasted') $$,
  '22P02',
  null,
  'Only typed and guided are allowed'
);

select col_is_null('cwr', 'chat_sessions', 'first_question_at', 'A chat started by topic buttons has no first typed question yet');

select * from finish();
rollback;

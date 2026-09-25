-- Inbox intake (cwr.create_inbox_thread) and the alert delivery log.
begin;
select plan(9);
select cwr_test.create_fixture();

select isnt(
  cwr.create_inbox_thread('test-a', 'contact', 'Jordan Smith', 'jordan@example.com', '', 'Contact form', 'I''d like a showing.'),
  null,
  'The server can record a new request'
);
select results_eq(
  $$ select t.status::text, t.contact_phone, m.kind::text, m.body
     from cwr.inbox_threads t join cwr.inbox_messages m on m.thread_id = t.id
     where t.contact_name = 'Jordan Smith' $$,
  $$ values ('new', null::text, 'inbound', 'I''d like a showing.') $$,
  'The thread starts as new with the visitor''s message, and a blank phone is stored as empty'
);
select throws_ok(
  $$ select cwr.create_inbox_thread('test-a', 'contact', 'No Contact', '', '', '', 'Hello') $$,
  '23514',
  null,
  'A request needs an email or a phone number'
);

select cwr_test.sign_out();
set local role anon;
select throws_ok(
  $$ select cwr.create_inbox_thread('test-a', 'contact', 'Bot', 'bot@example.com', '', '', 'spam') $$,
  '42501',
  null,
  'Visitors cannot write to the inbox directly'
);

reset role;
insert into cwr.alert_deliveries (tenant_id, kind, recipient_email, status, job_run_id)
values (cwr_test.id('tenant_a'), 'test', 'alerts@example.com', 'sent', gen_random_uuid());

select cwr_test.sign_in('staff');
set local role authenticated;
select is_empty($$ select 1 from cwr.alert_deliveries $$, 'Staff cannot read the delivery log');

reset role;
select cwr_test.sign_in('manager');
set local role authenticated;
select isnt_empty($$ select 1 from cwr.alert_deliveries $$, 'Managers can read the delivery log');
select throws_ok(
  $$ insert into cwr.alert_deliveries (tenant_id, kind, recipient_email, job_run_id) values (cwr_test.id('tenant_a'), 'test', 'x@example.com', gen_random_uuid()) $$,
  '42501',
  null,
  'Only the server writes deliveries'
);

reset role;
select cwr_test.sign_in('staff');
set local role authenticated;
select throws_ok(
  $$ update cwr.inbox_threads set contact_email = 'attacker@example.com' where id = cwr_test.id('staff_thread') $$,
  '42501',
  null,
  'Staff cannot change where replies are emailed'
);
select lives_ok(
  $$ select cwr.transition('inbox_status', cwr_test.id('staff_thread'), 'replied') $$,
  'Staff can still move their assigned thread through the workflow'
);

select * from finish();
rollback;

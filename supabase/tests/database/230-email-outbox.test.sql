-- Email outbox (docs/cwr-email-outbox-plan.md): the Send Email hook, the inbox triggers,
-- the cutover switch, claiming and finishing jobs, the private link values, and the wake-up.
begin;
select plan(27);
select cwr_test.create_fixture();
-- Start from an empty outbox (local runs may have real jobs; everything here is rolled back).
delete from cwr.email_jobs;

insert into cwr.email_settings (tenant_id) values (cwr_test.id('tenant_a')), (cwr_test.id('tenant_b')) on conflict do nothing;

-- The hook (called here as the database owner; the grant to Supabase Auth's role is checked below)

select ok(
  has_function_privilege('supabase_auth_admin', 'cwr.handle_auth_email(jsonb)', 'execute'),
  'Supabase Auth''s role may call the hook'
);
select is(
  cwr.handle_auth_email('{"user":{"id":"11111111-1111-1111-1111-111111111111","email":"Owner@Example.com"},"email_data":{"email_action_type":"recovery","token_hash":"first-hash"}}'),
  '{}'::jsonb,
  'Supabase Auth can hand a reset email to the outbox and gets Supabase''s success reply'
);
select is(
  cwr.handle_auth_email('{"user":{"id":"11111111-1111-1111-1111-111111111111","email":"owner@example.com"},"email_data":{"email_action_type":"recovery","token_hash":"second-hash"}}'),
  '{}'::jsonb,
  'A second reset request is accepted too'
);
select is(
  cwr.handle_auth_email('{"user":{"id":"11111111-1111-1111-1111-111111111111","email":"owner@example.com"},"email_data":{"email_action_type":"not_a_type"}}') -> 'error' ->> 'http_code',
  '500',
  'An email type Supabase never sends is refused in Supabase''s hook error format'
);
select is(
  cwr.handle_auth_email('{"user":{"id":"11111111-1111-1111-1111-111111111111","email":"owner@example.com","new_email":"new@example.com"},"email_data":{"email_action_type":"email_change","token_hash":"x","token_hash_new":"y"}}'),
  '{}'::jsonb,
  'An email change request is accepted'
);

select results_eq(
  $$ select status::text, coalesce(last_error, '') from cwr.email_jobs where action_type = 'recovery' order by status $$,
  $$ values ('not_sent', 'Superseded by a newer link'), ('pending', '') $$,
  'A newer reset link replaces the older one still waiting to go out'
);
select results_eq(
  $$ select recipient_email from cwr.email_jobs where action_type = 'email_change' order by recipient_email $$,
  $$ values ('new@example.com'), ('owner@example.com') $$,
  'An email change tells both the current and the new address'
);
select is(
  (select count(*)::int from cwr_private.email_job_secrets),
  1,
  'Only the newest reset link''s value is kept, and email changes keep none'
);
select is(
  (select recipient_email from cwr.email_jobs where action_type = 'recovery' and status = 'pending'),
  'owner@example.com',
  'Addresses are stored in lower case'
);

-- Who may do what --------------------------------------------------------------

select ok(
  not has_function_privilege('authenticated', 'cwr.handle_auth_email(jsonb)', 'execute')
  and not has_function_privilege('anon', 'cwr.handle_auth_email(jsonb)', 'execute'),
  'Visitors and signed-in people cannot call the hook'
);
select ok(
  not has_table_privilege('service_role', 'cwr_private.email_job_secrets', 'select')
  and not has_table_privilege('authenticated', 'cwr_private.email_job_secrets', 'select'),
  'No API role can read one-time link values directly'
);
select ok(
  not has_function_privilege('authenticated', 'cwr.claim_email_jobs(integer)', 'execute')
  and not has_function_privilege('authenticated', 'cwr.get_email_worker_secret()', 'execute'),
  'Signed-in people cannot claim jobs or read the wake-up secret'
);

-- The cutover switch and the inbox triggers -----------------------------------

insert into cwr.inbox_threads (tenant_id, source, contact_name, contact_email)
values (cwr_test.id('tenant_a'), 'contact', 'Before Switch', 'before@example.com');
select is(
  (select count(*)::int from cwr.email_jobs where kind = 'new_request'),
  0,
  'While the outbox is off, a new request adds no job (the old path still sends it)'
);

update cwr.email_settings set is_outbox_live = true where tenant_id = cwr_test.id('tenant_a');
insert into cwr.inbox_threads (id, tenant_id, source, contact_name, contact_email)
values ('f0000000-0000-0000-0000-000000000001', cwr_test.id('tenant_a'), 'contact', 'After Switch', 'after@example.com');
select is(
  (select thread_id from cwr.email_jobs where kind = 'new_request'),
  'f0000000-0000-0000-0000-000000000001'::uuid,
  'Once the outbox is on, a new request and its email job are saved together'
);
insert into cwr.inbox_messages (tenant_id, thread_id, kind, body, author_id)
values (cwr_test.id('tenant_a'), 'f0000000-0000-0000-0000-000000000001', 'reply', 'Thanks!', cwr_test.id('owner')),
       (cwr_test.id('tenant_a'), 'f0000000-0000-0000-0000-000000000001', 'internal_note', 'Called back', cwr_test.id('owner'));
select is(
  (select count(*)::int from cwr.email_jobs where kind = 'reply'),
  1,
  'A reply adds a reply job; an internal note adds none'
);
select throws_ok(
  $$ insert into cwr.inbox_threads (tenant_id, source, contact_name, contact_email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'contact', '', 'x@example.com') $$,
  '23514',
  null,
  'A request that fails to save is refused'
);
select is(
  (select count(*)::int from cwr.email_jobs where kind = 'new_request'),
  1,
  'and leaves no email job behind'
);

-- Claiming and finishing --------------------------------------------------------

delete from cwr.email_jobs where kind <> 'account' or action_type <> 'recovery';
set local role service_role;
select is(
  (select j ->> 'token_hash' from jsonb_array_elements(cwr.claim_email_jobs(10)) j),
  'second-hash',
  'The worker claims the waiting reset email together with its link value'
);
select is(
  jsonb_array_length(cwr.claim_email_jobs(10)),
  0,
  'A claimed job is not handed out twice'
);
select is(
  cwr.finish_email_job((select id from cwr.email_jobs where status = 'working'), 'retry', 'MailerSend busy'),
  'pending',
  'A failed send waits for another try'
);
reset role;
select ok(
  (select next_attempt_at > now() from cwr.email_jobs where action_type = 'recovery' and status = 'pending'),
  'The next try waits (backoff)'
);
update cwr.email_jobs set status = 'working', attempts = 5 where action_type = 'recovery' and status = 'pending';
set local role service_role;
select is(
  cwr.finish_email_job((select id from cwr.email_jobs where status = 'working'), 'retry', 'Still failing'),
  'failed',
  'After the 5th try the job gives up'
);
reset role;
select is(
  (select count(*)::int from cwr_private.email_job_secrets),
  0,
  'A finished job''s link value is deleted'
);

-- Expiry, problem digests, and the wake-up -------------------------------------

insert into cwr.email_jobs (tenant_id, kind, action_type, recipient_email, expires_at)
values (cwr_test.id('tenant_a'), 'account', 'invite', 'late@example.com', now() - interval '1 minute');
set local role service_role;
select is(
  (select count(*)::int from jsonb_array_elements(cwr.claim_email_jobs(10)) j where j ->> 'recipient_email' = 'late@example.com'),
  0,
  'An invite whose link has expired is never sent'
);
reset role;

insert into cwr.email_jobs (tenant_id, kind, action_type, recipient_email, expires_at, status, claimed_at, attempts)
values (cwr_test.id('tenant_a'), 'account', 'recovery', 'crashed@example.com', now() - interval '1 minute', 'working', now() - interval '11 minutes', 1);
set local role service_role;
select is(
  (select count(*)::int from jsonb_array_elements(cwr.claim_email_jobs(10)) j where j ->> 'recipient_email' = 'crashed@example.com'),
  0,
  'A reset email whose send crashed is not retried once its link has expired'
);
reset role;

select cwr.queue_problem_digest();
select cwr.queue_problem_digest();
update cwr.email_settings set worker_url = 'http://worker.test/functions/v1/email-worker' where tenant_id = cwr.get_default_tenant_id();
select cwr.post_email_worker();
select ok(
  (select count(*) from cwr.email_jobs where kind = 'problem_digest' and tenant_id = cwr_test.id('tenant_a')) = 1
  and exists (select 1 from net.http_request_queue where url = 'http://worker.test/functions/v1/email-worker'),
  'One problem digest waits per tenant, and waking the worker queues a call to its address'
);

insert into cwr.health_checks (tenant_id, name, last_run_at) values (cwr_test.id('tenant_a'), 'problem_alerts', now());
update cwr.email_settings set is_outbox_live = false where tenant_id = cwr_test.id('tenant_a');
select is_empty(
  $$ select 1 from cwr.health_checks where tenant_id = cwr_test.id('tenant_a') and name = 'problem_alerts' $$,
  'Switching the outbox off pauses problem emails without leaving a heartbeat to go stale'
);

select * from finish();
rollback;

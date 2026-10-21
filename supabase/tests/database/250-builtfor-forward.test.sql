-- Forwarding problems to BuiltFor Ops (20261021000100_cwr_builtfor_forward.sql): what is
-- queued, what is sent, retries and giving up, the local alert, clean-up, and who may run it.
-- Calls are made here as the database owner, like the cron job.
begin;
select plan(28);
select cwr_test.create_fixture();

create temp table receiver as
  select 'http://receiver.test/functions/v1/tenant-alert-receiver'::text as url;

-- Problems of every kind; error and critical rows of tenant A after forward_from are the ones to send.
insert into cwr.problem_events (id, tenant_id, occurred_at, origin, area, action, stage, severity, code, detail, fingerprint, reference, release)
values
  ('f0000000-0000-0000-0000-000000000001', cwr_test.id('tenant_a'), now() - interval '10 minutes', 'server_member', 'users', 'users.invite', 'external', 'critical', 'smtp_down', 'Mail server refused', repeat('a', 32), 'CWR-AAA-001', 'v1.2.3'),
  ('f0000000-0000-0000-0000-000000000002', cwr_test.id('tenant_a'), now() - interval '5 minutes', 'server_signin', 'auth', 'auth.not_listed', 'auth', 'error', null, null, repeat('b', 32), 'CWR-AAA-002', null),
  ('f0000000-0000-0000-0000-000000000003', cwr_test.id('tenant_a'), now() - interval '5 minutes', 'server_member', 'users', 'users.invite', 'validate', 'warning', 'slow', null, repeat('c', 32), 'CWR-AAA-003', null),
  ('f0000000-0000-0000-0000-000000000004', cwr_test.id('tenant_a'), now() - interval '5 minutes', 'server_member', 'users', 'users.invite', 'validate', 'info', 'typo', null, repeat('d', 32), 'CWR-AAA-004', null),
  ('f0000000-0000-0000-0000-000000000005', cwr_test.id('tenant_b'), now() - interval '5 minutes', 'server_member', 'users', 'users.invite', 'external', 'error', 'smtp_down', null, repeat('e', 32), 'CWR-BBB-005', null),
  ('f0000000-0000-0000-0000-000000000006', cwr_test.id('tenant_a'), now() - interval '2 hours', 'server_member', 'users', 'users.invite', 'external', 'error', 'smtp_down', null, repeat('f', 32), 'CWR-AAA-006', null),
  ('f0000000-0000-0000-0000-000000000007', cwr_test.id('tenant_a'), now() - interval '8 days', 'server_member', 'users', 'users.invite', 'external', 'error', 'smtp_down', null, repeat('0', 32), 'CWR-AAA-007', null);

-- Who may run it --------------------------------------------------------------

select is_empty(
  $$ select p.proname from pg_proc p
     where p.pronamespace = 'cwr'::regnamespace
       and (p.proname like '%builtfor%')
       and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')) $$,
  'Visitors and signed-in users cannot run any forwarding function'
);
select ok(
  exists (select 1 from cron.job where jobname = 'cwr_forward_builtfor' and schedule = '* * * * *' and command = 'select cwr.forward_builtfor_alerts()'),
  'The forwarder runs every minute'
);

-- Switched off: nothing is queued or sent --------------------------------------

select cwr.forward_builtfor_alerts();
select ok(
  not exists (select 1 from cwr.builtfor_forwards) and not exists (select 1 from net.http_request_queue q, receiver r where q.url = r.url),
  'Without a settings row nothing is queued or sent'
);

insert into cwr.builtfor_forward_settings (local_tenant_id, builtfor_tenant_id, builtfor_tenant_name, receiver_url, forward_from)
select cwr_test.id('tenant_a'), '9b0e0f6e-0000-4000-8000-000000000001', 'CW Realty', r.url, now() - interval '1 hour' from receiver r;
select cwr.forward_builtfor_alerts();
select ok(
  not exists (select 1 from cwr.builtfor_forwards) and not exists (select 1 from net.http_request_queue q, receiver r where q.url = r.url),
  'While switched off nothing is queued or sent'
);

update cwr.builtfor_forward_settings set is_enabled = true;
select cwr.forward_builtfor_alerts();
select ok(
  not exists (select 1 from cwr.builtfor_forwards) and not exists (select 1 from net.http_request_queue q, receiver r where q.url = r.url),
  'Without the Vault secret nothing is queued or sent'
);

-- Switched on: what is queued -----------------------------------------------------

select vault.create_secret('test-webhook-secret', 'builtfor_webhook_secret');
select cwr.forward_builtfor_alerts();

select set_eq(
  $$ select source_id from cwr.builtfor_forwards $$,
  array['f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002']::uuid[],
  'Only tenant A''s error and critical problems since forward_from are queued'
);
select is_empty(
  $$ select 1 from cwr.builtfor_forwards where source_id in ('f0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000004') $$,
  'Warnings and info problems are not queued'
);
select is_empty(
  $$ select 1 from cwr.builtfor_forwards where source_id = 'f0000000-0000-0000-0000-000000000005' $$,
  'Another tenant''s problems are not queued'
);
select is_empty(
  $$ select 1 from cwr.builtfor_forwards where source_id in ('f0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000007') $$,
  'Problems before forward_from or older than 7 days are not queued'
);

-- What is sent ----------------------------------------------------------------------

select is(
  (select count(*)::int from net.http_request_queue q, receiver r where q.url = r.url),
  2,
  'One request is sent per queued problem'
);
select ok(
  (select bool_and(q.headers ->> 'x-builtfor-webhook-secret' = 'test-webhook-secret' and q.timeout_milliseconds = 15000 and q.method = 'POST')
   from net.http_request_queue q, receiver r where q.url = r.url),
  'Each request is a POST with the webhook secret header and a 15 second timeout'
);
select is(
  cwr.builtfor_alert_payload(
    (select e from cwr.problem_events e where e.id = 'f0000000-0000-0000-0000-000000000001'),
    (select s from cwr.builtfor_forward_settings s)),
  jsonb_build_object(
    'source', 'problem_events',
    'sourceRowId', md5('cwr:f0000000-0000-0000-0000-000000000001')::uuid,
    'tenantId', '9b0e0f6e-0000-4000-8000-000000000001',
    'tenantName', 'CW Realty',
    'severity', 'critical',
    'category', 'service_error',
    'title', 'Invite a user — smtp_down',
    'detail', E'Ref CWR-AAA-001 · server_member · external · release v1.2.3\nMail server refused',
    'component', 'users',
    'operation', 'users.invite',
    'entityId', 'CWR-AAA-001',
    'occurredAt', (select occurred_at from cwr.problem_events where id = 'f0000000-0000-0000-0000-000000000001'),
    'dedupKey', repeat('a', 32)),
  'The payload maps a problem to the receiver''s fields'
);
select is(
  (select convert_from(q.body, 'UTF8')::jsonb from net.http_request_queue q
   join cwr.builtfor_forwards f on f.request_id = q.id
   where f.source_id = 'f0000000-0000-0000-0000-000000000002'),
  jsonb_build_object(
    'source', 'problem_events',
    'sourceRowId', md5('cwr:f0000000-0000-0000-0000-000000000002')::uuid,
    'tenantId', '9b0e0f6e-0000-4000-8000-000000000001',
    'tenantName', 'CW Realty',
    'severity', 'error',
    'category', 'auth_event',
    'title', 'auth.not_listed — no code',
    'detail', E'Ref CWR-AAA-002 · server_signin · auth · release ?\n',
    'component', 'auth',
    'operation', 'auth.not_listed',
    'entityId', 'CWR-AAA-002',
    'occurredAt', (select occurred_at from cwr.problem_events where id = 'f0000000-0000-0000-0000-000000000002'),
    'dedupKey', repeat('b', 32)),
  'A sign-in problem without a catalog label or code is sent as an auth event with fallbacks'
);

select cwr.forward_builtfor_alerts();
select ok(
  (select count(*) from cwr.builtfor_forwards) = 2
  and (select count(*) from net.http_request_queue q, receiver r where q.url = r.url) = 2,
  'A second run queues and sends nothing new'
);

insert into cwr.problem_events (id, tenant_id, occurred_at, origin, area, action, stage, severity, fingerprint, reference)
select ('f1000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, cwr_test.id('tenant_a'), now() - interval '30 seconds' * n,
       'job', 'jobs', 'jobs.watchdog', 'job', 'error', repeat('1', 32), 'CWR-BUR-' || lpad(n::text, 3, '0')
from generate_series(1, 60) n;
select cwr.forward_builtfor_alerts();
select is(
  (select count(*)::int from net.http_request_queue q, receiver r where q.url = r.url),
  52,
  'At most 50 requests are sent per run'
);
select is_empty(
  $$ with burst as (
       select f.request_id, e.occurred_at from cwr.builtfor_forwards f join cwr.problem_events e on e.id = f.source_id
       where f.source_id::text like 'f1000000%')
     select 1 from burst
     where request_id is null and occurred_at < (select max(occurred_at) from burst where request_id is not null) $$,
  'The oldest problems are sent first'
);

-- Answers, retries and giving up -----------------------------------------------

insert into cwr.builtfor_forwards (source_id, attempts, created_at) values
  ('f2000000-0000-0000-0000-000000000001', 0, now()),
  ('f2000000-0000-0000-0000-000000000002', 0, now()),
  ('f2000000-0000-0000-0000-000000000003', 2, now()),
  ('f2000000-0000-0000-0000-000000000004', 5, now() - interval '25 hours');

select is(
  cwr.builtfor_apply_response(p_source_id => 'f2000000-0000-0000-0000-000000000001', p_status => 200, p_error => null),
  'sent',
  'A 2xx answer marks the problem sent'
);
select is(
  cwr.builtfor_apply_response(p_source_id => 'f2000000-0000-0000-0000-000000000002', p_status => 500, p_error => 'boom'),
  'pending',
  'A 500 answer keeps the problem for a retry'
);
select ok(
  (select attempts = 1 and request_id is null and last_status = 500
      and next_attempt_at between now() + interval '30 seconds' and now() + interval '1 minute'
   from cwr.builtfor_forwards where source_id = 'f2000000-0000-0000-0000-000000000002'),
  'The first retry waits between half a minute and a minute'
);
select is(
  cwr.builtfor_apply_response(p_source_id => 'f2000000-0000-0000-0000-000000000003', p_status => 401, p_error => 'bad secret'),
  'pending',
  'A 401 answer keeps the problem for a retry'
);
select ok(
  (select attempts = 3 and next_attempt_at between now() + interval '2 minutes' and now() + interval '4 minutes'
   from cwr.builtfor_forwards where source_id = 'f2000000-0000-0000-0000-000000000003'),
  'After two failures the retry waits between two and four minutes'
);
select is(
  cwr.builtfor_apply_response(p_source_id => 'f2000000-0000-0000-0000-000000000004', p_status => 500, p_error => 'boom'),
  'dead',
  'A problem still failing 24 hours after it was queued is given up on'
);

-- Reconciling unanswered requests, and the local alert ------------------------------

select is_empty(
  $$ select 1 from cwr.problem_events where code = 'builtfor_forward_dead' $$,
  'No local alert is raised while nothing has been given up on'
);
insert into cwr.builtfor_forwards (source_id, request_id, requested_at, created_at) values
  ('f3000000-0000-0000-0000-000000000001', -1, now() - interval '20 minutes', now()),
  ('f3000000-0000-0000-0000-000000000002', -2, now() - interval '20 minutes', now() - interval '25 hours'),
  ('f3000000-0000-0000-0000-000000000003', -3, now() - interval '20 minutes', now() - interval '25 hours');
select cwr.forward_builtfor_alerts();
select ok(
  (select status = 'pending' and attempts = 1 and request_id is null and last_error = 'no response'
   from cwr.builtfor_forwards where source_id = 'f3000000-0000-0000-0000-000000000001'),
  'A request with no answer after 15 minutes is retried'
);
select ok(
  (select count(*) from cwr.builtfor_forwards where source_id::text like 'f3000000%' and status = 'dead') = 2
  and (select count(*) from cwr.problem_events
       where tenant_id = cwr_test.id('tenant_a') and code = 'builtfor_forward_dead' and severity = 'critical'
         and detail = '2 alerts could not be delivered to BuiltFor Ops') = 1,
  'Problems given up on in one run raise one critical local problem'
);

-- Clean-up -----------------------------------------------------------------------

insert into cwr.builtfor_forwards (source_id, status, sent_at, created_at) values
  ('f4000000-0000-0000-0000-000000000001', 'sent', now() - interval '31 days', now() - interval '31 days'),
  ('f4000000-0000-0000-0000-000000000002', 'dead', null, now() - interval '31 days'),
  ('f4000000-0000-0000-0000-000000000003', 'pending', null, now() - interval '31 days');
select cwr.forward_builtfor_alerts();
select set_eq(
  $$ select source_id from cwr.builtfor_forwards where source_id::text like 'f4000000%' $$,
  array['f4000000-0000-0000-0000-000000000002', 'f4000000-0000-0000-0000-000000000003']::uuid[],
  'Sent rows older than 30 days are removed; pending and dead rows are kept'
);

-- Recording problems is unchanged ------------------------------------------------

select ok(
  (cwr.record_problem(jsonb_build_object('tenant_id', cwr_test.id('tenant_a'), 'origin', 'server_member', 'action', 'users.invite', 'stage', 'external', 'severity', 'error', 'code', 'still_works')) ->> 'stored')::boolean,
  'Problems are still recorded with the forwarder installed'
);

-- The 7-day bound on its own (last, because it queues the 2-hour-old problem) ----------

update cwr.builtfor_forward_settings set forward_from = now() - interval '30 days';
select cwr.forward_builtfor_alerts();
select ok(
  exists (select 1 from cwr.builtfor_forwards where source_id = 'f0000000-0000-0000-0000-000000000006')
  and not exists (select 1 from cwr.builtfor_forwards where source_id = 'f0000000-0000-0000-0000-000000000007'),
  'Problems older than 7 days are not queued even when forward_from is earlier'
);

select * from finish();
rollback;

-- Problem tracking (docs/cwr-error-tracking-plan.md): who may write and read problems,
-- flood and spike rules, alert digests, the status workflow, recipient guard, retention,
-- and the database watchdog.
begin;
select plan(50);
select cwr_test.create_fixture();

-- Records one problem for tenant A as the server (service role) and returns the result.
create function pg_temp.record(p_event jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_event jsonb := jsonb_build_object('tenant_id', cwr_test.id('tenant_a')) || p_event;
  v_result jsonb;
begin
  set local role service_role;
  v_result := cwr.record_problem(v_event);
  reset role;
  return v_result;
end;
$$;

create function pg_temp.record_many(p_event jsonb, p_count integer)
returns void
language sql
as $$
  select pg_temp.record(p_event) from generate_series(1, p_count);
$$;

create function pg_temp.group_of(p_action text, p_code text)
returns cwr.problem_groups
language sql
as $$
  select * from cwr.problem_groups
  where tenant_id = cwr_test.id('tenant_a') and action = p_action and code is not distinct from p_code;
$$;

create function pg_temp.claim()
returns jsonb
language plpgsql
as $$
declare
  v_tenant_id uuid := cwr_test.id('tenant_a');
  v_result jsonb;
begin
  set local role service_role;
  v_result := cwr.claim_problem_alerts(v_tenant_id);
  reset role;
  return v_result;
end;
$$;

create function pg_temp.finish(p_run_id uuid, p_outcome text)
returns void
language plpgsql
as $$
begin
  set local role service_role;
  perform cwr.finish_problem_alerts(p_run_id, p_outcome);
  reset role;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may write and read
-- ---------------------------------------------------------------------------

select ok(not has_function_privilege('authenticated', 'cwr.record_problem(jsonb)', 'execute'), 'Signed-in users cannot record problems directly');
select ok(not has_function_privilege('anon', 'cwr.record_problem(jsonb)', 'execute'), 'Visitors cannot record problems');
select ok(has_function_privilege('service_role', 'cwr.record_problem(jsonb)', 'execute'), 'The server records problems');

select pg_temp.record('{"id":"f0000000-0000-0000-0000-000000000001","origin":"server_member","action":"homework.save_file","stage":"storage","severity":"error","code":"StorageError","shown_message":"Mail jo@example.com failed","reference":"CWR-AAA-BBB"}');

select cwr_test.sign_in('owner');
set local role authenticated;
select is((select count(*)::int from cwr.problem_events where tenant_id = cwr_test.id('tenant_a')), 1, 'Owners read their problems');
reset role;
select cwr_test.sign_in('manager');
set local role authenticated;
select is_empty($$ select 1 from cwr.problem_events $$, 'Managers cannot read problems');
select throws_ok(
  $$ insert into cwr.problem_events (id, tenant_id, origin, area, action, stage, severity, fingerprint, reference)
     values (gen_random_uuid(), cwr_test.id('tenant_a'), 'server_member', 'x', 'x.x', 'rule', 'info', repeat('a', 32), 'CWR-AAA-AAA') $$,
  '42501', null, 'Nobody writes problems directly'
);
reset role;

select is((select shown_message from cwr.problem_events where reference = 'CWR-AAA-BBB'), 'Mail [email] failed', 'Email addresses are scrubbed');

-- ---------------------------------------------------------------------------
-- Idempotency, references, normalisation
-- ---------------------------------------------------------------------------

select is(
  pg_temp.record('{"id":"f0000000-0000-0000-0000-000000000001","origin":"server_member","action":"homework.save_file","stage":"storage","severity":"error","code":"StorageError"}') ->> 'reference',
  'CWR-AAA-BBB',
  'A retried report returns the stored reference'
);
select is((pg_temp.group_of('homework.save_file', 'StorageError')).total_count, 1, 'A retried report is not counted twice');
select isnt(
  pg_temp.record('{"origin":"server_member","action":"homework.save_file","stage":"storage","severity":"error","code":"StorageError","reference":"CWR-AAA-BBB"}') ->> 'reference',
  'CWR-AAA-BBB',
  'A reference already in use is replaced with a fresh one'
);
select pg_temp.record('{"origin":"browser_signin","action":"auth.bot_check_widget","stage":"browser","severity":"critical"}');
select is((select severity from cwr.problem_events where action = 'auth.bot_check_widget'), 'warning', 'Reports from the sign-in pages are capped at warning');
select pg_temp.record('{"origin":"server_member","action":"made.up","stage":"rule","severity":"info"}');
select is((select action from cwr.problem_events where detail like 'Unlisted action: made.up%'), 'unknown.unknown', 'Unlisted actions are stored as unknown');

-- ---------------------------------------------------------------------------
-- Flood cap and spikes
-- ---------------------------------------------------------------------------

select pg_temp.record_many(jsonb_build_object('origin', 'server_member', 'actor_id', cwr_test.id('staff'), 'action', 'listings.update', 'stage', 'validate', 'severity', 'info', 'code', 'flood'), 30);
select is(
  pg_temp.record(jsonb_build_object('origin', 'server_member', 'actor_id', cwr_test.id('staff'), 'action', 'listings.update', 'stage', 'validate', 'severity', 'info', 'code', 'flood')) ->> 'suppressed',
  'true',
  'One person''s 31st problem in a minute is not stored'
);
select is((pg_temp.group_of('listings.update', 'flood')).suppressed_count, 1, 'A suppressed problem is still counted');
select is(
  pg_temp.record(jsonb_build_object('origin', 'server_member', 'actor_id', cwr_test.id('staff'), 'action', 'listings.move', 'stage', 'database', 'severity', 'error', 'code', 'XX000')) ->> 'stored',
  'true',
  'System faults are never pushed out by a flood of typing mistakes'
);

select pg_temp.record_many('{"origin":"server_signin","action":"auth.sign_in","stage":"auth","severity":"info","code":"captcha_failed"}', 25);
select is((pg_temp.group_of('auth.sign_in', 'captcha_failed')).alert_pending, false, 'Bot-check refusals never trigger an alert');
select pg_temp.record_many('{"origin":"server_signin","action":"auth.sign_in","stage":"auth","severity":"info","code":"invalid_credentials"}', 20);
select is((pg_temp.group_of('auth.sign_in', 'invalid_credentials')).alert_pending, true, '20 wrong passwords in 15 minutes trigger an alert');

-- ---------------------------------------------------------------------------
-- Alert digests
-- ---------------------------------------------------------------------------

update cwr.problem_groups set alert_pending = false where tenant_id = cwr_test.id('tenant_a');
select pg_temp.record('{"origin":"server_member","action":"trash.delete_forever","stage":"storage","severity":"error","code":"digest"}');
select is(jsonb_array_length(pg_temp.claim() -> 'groups'), 1, 'A system fault is claimed for the next digest');
select is(pg_temp.claim(), null, 'A digest being sent is not claimed twice');

select pg_temp.finish((select id from cwr.problem_alert_runs where tenant_id = cwr_test.id('tenant_a')), 'failed');
update cwr.problem_alert_runs set claimed_at = null where tenant_id = cwr_test.id('tenant_a');
select is(
  (pg_temp.claim() ->> 'run_id')::uuid,
  (select id from cwr.problem_alert_runs where tenant_id = cwr_test.id('tenant_a')),
  'A failed digest is re-sent with the same run id'
);
select pg_temp.finish((select id from cwr.problem_alert_runs where tenant_id = cwr_test.id('tenant_a')), 'sent');
select is((pg_temp.group_of('trash.delete_forever', 'digest')).alert_pending, false, 'Sent problems are no longer pending');

select pg_temp.record('{"origin":"server_member","action":"trash.delete_forever","stage":"storage","severity":"error","code":"digest"}');
select is(pg_temp.claim(), null, 'The same problem is not emailed again within an hour');
select pg_temp.record('{"origin":"server_member","action":"trash.delete_forever","stage":"storage","severity":"critical","code":"digest"}');
select isnt(pg_temp.claim(), null, 'An escalation to critical skips the hour wait');
select pg_temp.finish((select id from cwr.problem_alert_runs where tenant_id = cwr_test.id('tenant_a') and status = 'open'), 'not_sent');
select is_empty($$ select 1 from cwr.problem_alert_runs where tenant_id = cwr_test.id('tenant_a') and status = 'open' $$, 'A digest that could not be sent (email not set up) is rebuilt later');

select isnt(pg_temp.claim(), null, 'Pending problems are claimed again once email works');
select pg_temp.finish((select id from cwr.problem_alert_runs where tenant_id = cwr_test.id('tenant_a') and status = 'open'), 'refused');
select isnt((pg_temp.group_of('jobs.problem_alerts', 'emails_refused')).id, null, 'Refused problem emails become a critical problem');
select is(pg_temp.claim(), null, 'After refused emails the sender waits before trying again');

-- ---------------------------------------------------------------------------
-- Status workflow and audit
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ update cwr.problem_groups set status = 'resolved' where tenant_id = cwr_test.id('tenant_a') $$,
  '42501', null, 'Status changes go through the workflow engine'
);
select lives_ok(
  $$ select cwr.transition('problem_status', (select id from cwr.problem_groups where action = 'homework.save_file'), 'resolved') $$,
  'A problem is resolved through the workflow engine'
);
select pg_temp.record('{"origin":"server_member","action":"homework.save_file","stage":"storage","severity":"error","code":"StorageError"}');
select is((pg_temp.group_of('homework.save_file', 'StorageError')).status, 'open', 'A new occurrence reopens a resolved problem');
select is(
  (select count(*)::int from cwr.audit_log where table_name = 'problem_groups' and record_id = (pg_temp.group_of('homework.save_file', 'StorageError')).id),
  3,
  'Only creation and status changes are audited, not each count'
);

-- ---------------------------------------------------------------------------
-- Problem-alert recipients
-- ---------------------------------------------------------------------------

insert into cwr.notification_recipients (tenant_id, full_name, email) values (cwr_test.id('tenant_a'), 'Pat', 'pat@example.com');
select cwr_test.sign_in('manager');
set local role authenticated;
select throws_ok(
  $$ update cwr.notification_recipients set gets_problem_alerts = true where email = 'pat@example.com' $$,
  '42501', 'Only an owner can change who gets problem alerts', 'Managers cannot turn on problem alerts'
);
reset role;
select cwr_test.sign_in('owner');
set local role authenticated;
select lives_ok(
  $$ update cwr.notification_recipients set gets_problem_alerts = true where email = 'pat@example.com' $$,
  'Owners choose who gets problem alerts'
);
reset role;
select cwr_test.sign_in('manager');
set local role authenticated;
select throws_ok(
  $$ update cwr.notification_recipients set email = 'manager@example.com' where email = 'pat@example.com' $$,
  '42501', null, 'Managers cannot redirect problem alerts by changing the email'
);
select throws_ok(
  $$ delete from cwr.notification_recipients where email = 'pat@example.com' $$,
  '42501', null, 'Managers cannot remove someone who gets problem alerts'
);
reset role;

-- ---------------------------------------------------------------------------
-- Append-only and retention
-- ---------------------------------------------------------------------------

select throws_ok($$ delete from cwr.problem_events $$, '42501', null, 'The problem log cannot be edited');
alter table cwr.problem_events disable trigger problem_events_prevent_change;
update cwr.problem_events set occurred_at = now() - interval '13 months' where reference = 'CWR-AAA-BBB';
alter table cwr.problem_events enable trigger problem_events_prevent_change;
select cwr.purge_expired_problems();
select is_empty($$ select 1 from cwr.problem_events where reference = 'CWR-AAA-BBB' $$, 'Problems older than a year are purged');

-- ---------------------------------------------------------------------------
-- Watchdog
-- ---------------------------------------------------------------------------

select cwr.touch_heartbeat('problem_alerts', cwr_test.id('tenant_b'));
select is((select last_ok_at from cwr.health_checks where tenant_id = cwr_test.id('tenant_b') and name = 'problem_alerts'), null, 'A heartbeat never counts as success');
insert into cwr.health_checks (tenant_id, name, last_run_at, last_runid) values
  (cwr_test.id('tenant_a'), 'scheduled_jobs', now(), (select coalesce(max(runid), 0) from cron.job_run_details));
insert into cron.job_run_details (jobid, runid, job_pid, database, username, command, status, return_message, start_time, end_time)
select jobid, (select coalesce(max(runid), 0) + 1 from cron.job_run_details), 0, 'postgres', 'postgres', command, 'failed', 'disk full', now(), now()
from cron.job where jobname = 'cwr_purge_trash';
select cwr.touch_health_check('problem_log_writes', false, 'write failed', cwr_test.id('tenant_a'));
select cwr.check_scheduled_jobs();
select isnt((pg_temp.group_of('database.scheduled_job', 'failed')).id, null, 'A failed scheduled job becomes a problem');
select isnt((pg_temp.group_of('database.health_check', 'problem_log_writes_failing')).id, null, 'A failing problem log becomes a problem');
select cwr.check_scheduled_jobs();
select is((pg_temp.group_of('database.scheduled_job', 'failed')).total_count, 1, 'The same failed run is recorded once');

select pg_temp.record('{"origin":"database","action":"database.health_check","stage":"setup","severity":"info","code":"self"}');
select ok(
  (select last_error_at > coalesce(last_ok_at, '-infinity') from cwr.health_checks where tenant_id = cwr_test.id('tenant_a') and name = 'problem_log_writes'),
  'The database''s own problems do not clear the problem-log alarm'
);

-- ---------------------------------------------------------------------------
-- More edge cases: retries, reopening, pausing, stale clean-up, scrubbing
-- ---------------------------------------------------------------------------

update cwr.problem_alert_runs set status = 'sent', finished_at = now() - interval '2 hours' where tenant_id = cwr_test.id('tenant_a') and status = 'abandoned';
update cwr.problem_groups set alert_pending = false, last_alerted_at = now(), last_alerted_severity = 'error' where tenant_id = cwr_test.id('tenant_a');
select pg_temp.record('{"origin":"server_member","action":"homework.remove_cover","stage":"storage","severity":"error","code":"retry"}');
create temp table claimed_run as select (pg_temp.claim() ->> 'run_id')::uuid as id;
update cwr.problem_alert_runs set attempts = 5 where id = (select id from claimed_run);
select pg_temp.finish((select id from claimed_run), 'failed');
select is(
  (select status from cwr.problem_alert_runs where id = (select id from claimed_run)),
  'abandoned',
  'A digest that keeps failing is given up after 6 tries'
);
select isnt((pg_temp.group_of('jobs.problem_alerts', 'retries_exhausted')).id, null, 'Giving up on a digest is itself a critical problem');

update cwr.problem_groups set last_alerted_at = now() - interval '10 minutes', last_alerted_severity = 'error', alert_pending = false where action = 'homework.save_file' and tenant_id = cwr_test.id('tenant_a');
select cwr.transition('problem_status', (pg_temp.group_of('homework.save_file', 'StorageError')).id, 'resolved');
update cwr.problem_alert_runs set finished_at = now() - interval '2 hours' where tenant_id = cwr_test.id('tenant_a') and status = 'abandoned';
select pg_temp.record('{"origin":"server_member","action":"homework.save_file","stage":"storage","severity":"error","code":"StorageError"}');
select ok(
  (pg_temp.claim() -> 'groups') @> '[{"label": "Save an uploaded Homework file"}]',
  'A resolved problem that comes back is emailed again without waiting out the hour'
);

insert into cwr.notification_recipients (tenant_id, full_name, email, gets_problem_alerts) values (cwr_test.id('tenant_a'), 'Owner Pick', 'pick@example.com', true);
select cwr_test.sign_in('manager');
set local role authenticated;
select throws_ok(
  $$ update cwr.notification_recipients set is_active = false where email = 'pick@example.com' $$,
  '42501', null, 'Managers cannot silence problem alerts by pausing a chosen recipient'
);
reset role;

update cwr.health_checks set created_at = now() - interval '2 days', last_ok_at = null where tenant_id = cwr_test.id('tenant_a') and name = 'photo_cleanup';
insert into cwr.health_checks (tenant_id, name, last_run_at, created_at) values (cwr_test.id('tenant_a'), 'photo_cleanup', now(), now() - interval '2 days')
  on conflict (tenant_id, name) do update set created_at = now() - interval '2 days', last_ok_at = null;
select cwr.check_scheduled_jobs();
select isnt((pg_temp.group_of('database.health_check', 'photo_cleanup_stale')).id, null, 'A photo clean-up that has not finished in 36 hours becomes a problem');
select cwr.touch_health_check('photo_cleanup', true, null, cwr_test.id('tenant_a'));
select isnt((select last_ok_at from cwr.health_checks where tenant_id = cwr_test.id('tenant_a') and name = 'photo_cleanup'), null, 'A successful clean-up clears the alarm, even when it never succeeded before');

select is(cwr.get_scrubbed_text('Your code 123456 did not work', 300), 'Your code [number] did not work', 'Six-digit codes are scrubbed');

select is_empty(
  $$ select 1 from cwr.health_checks h join cwr.tenants t on t.id = h.tenant_id where t.slug = 'cwr' and h.name = 'problem_alerts' $$,
  'While problem emails are paused, the paused sender is not watched (20260930000100)'
);

select * from finish();
rollback;

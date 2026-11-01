-- 623 Summit's guest email queue (20261031000100_summit_email_outbox.sql; 623Summit repo,
-- docs/guest-email-plan.md R1–R11): booking events, the guest-email rule, supersede, owner
-- alerts, claiming and finishing, the switch, "Email me my link", link replacement, rights,
-- updated_at and the purge.
begin;
select plan(79);

-- Start from a known state (local runs may have real rows; everything here is rolled back).
delete from summit.email_jobs;
delete from summit.link_requests;
delete from summit.token_rotations;
update summit.email_settings set is_live = false, worker_url = null, reply_to = null, owner_alert_to = null, daily_limit = 200;
insert into summit.admins (email, label) values ('summit-owner@test.cwr', 'Test owner') on conflict do nothing;

-- Stays sit thousands of days out so they never meet a local booking's dates.
create function pg_temp.book(p_id uuid, p_days integer, p_status text, p_email text, p_source text default 'website', p_email_guest boolean default true)
returns void
language sql
as $$
  insert into summit.bookings (id, check_in, check_out, guests, occasion, name, email, phone, status, source, email_guest, hold_expires_at)
  values (p_id, current_date + p_days, current_date + p_days + 3, 2, 'Other', 'Test Guest', p_email, '5550001111', p_status, p_source, p_email_guest,
          case when p_status = 'pending' then now() + interval '48 hours' end);
$$;

-- One booking's jobs as kind:event:status[:recipient], sorted (now() is fixed, so created_at cannot order them).
create function pg_temp.jobs(p_booking_id uuid)
returns text[]
language sql
as $$
  select coalesce(array_agg(kind::text || ':' || event || ':' || status::text || coalesce(':' || recipient_email::text, '') order by 1), '{}')
  from summit.email_jobs where booking_id = p_booking_id;
$$;

create function pg_temp.id(p_n integer)
returns uuid
language sql
immutable
as $$
  select ('f3000000-0000-0000-0000-' || lpad(p_n::text, 12, '0'))::uuid;
$$;

create function pg_temp.sign_in_as_summit_owner()
returns void
language sql
as $$
  select set_config('request.jwt.claims',
    jsonb_build_object('sub', 'f3000000-0000-0000-0000-0000000000aa', 'email', 'summit-owner@test.cwr', 'role', 'authenticated')::text, true);
$$;

-- ---------------------------------------------------------------- R1: inserts and the switch
select pg_temp.book(pg_temp.id(1), 3000, 'pending', 'guest1@example.test');
select is(pg_temp.jobs(pg_temp.id(1)), '{}'::text[], 'R1: nothing is queued while sending is off');

update summit.email_settings set is_live = true;
select pg_temp.book(pg_temp.id(2), 3010, 'pending', 'guest2@example.test');
select is(pg_temp.jobs(pg_temp.id(2)), array['guest:received:pending'], 'R1: a website request queues one "received" email');

select pg_temp.book(pg_temp.id(3), 3020, 'confirmed', 'guest3@example.test', 'owner');
select is(pg_temp.jobs(pg_temp.id(3)), array['guest:confirmed:pending'], 'R1: an owner-entered confirmed stay queues one "confirmed" email');

-- ---------------------------------------------------------------- R2: status edges
delete from summit.email_jobs;
update summit.bookings set status = 'confirmed' where id = pg_temp.id(2);
select is(pg_temp.jobs(pg_temp.id(2)), array['guest:confirmed:pending'], 'R2: pending to confirmed queues "confirmed"');
delete from summit.email_jobs;
update summit.bookings set status = 'declined' where id = pg_temp.id(2);
select is(pg_temp.jobs(pg_temp.id(2)), array['guest:declined:pending'], 'R2: declining queues "declined"');
delete from summit.email_jobs;
update summit.bookings set status = 'pending' where id = pg_temp.id(2);
select is(pg_temp.jobs(pg_temp.id(2)), array['guest:received:pending'], 'R2: reopening a declined request queues "received"');
delete from summit.email_jobs;
update summit.bookings set status = 'cancelled', cancelled_by = 'owner' where id = pg_temp.id(2);
select is(pg_temp.jobs(pg_temp.id(2)), array['guest:cancelled:pending'], 'R2: cancelling queues "cancelled"');
delete from summit.email_jobs;
update summit.bookings set status = 'archived' where id = pg_temp.id(2);
update summit.bookings set status = 'archived' where id = pg_temp.id(2);
select is(pg_temp.jobs(pg_temp.id(2)), '{}'::text[], 'R2: archiving, and repeating an update, queue nothing');
select pg_temp.book(pg_temp.id(4), 3030, 'pending', 'guest4@example.test');
delete from summit.email_jobs;
update summit.bookings set status = 'pending' where id = pg_temp.id(4);
select is(pg_temp.jobs(pg_temp.id(4)), '{}'::text[], 'R2: pending to pending queues nothing');
update summit.bookings set hold_expires_at = now() - interval '1 hour' where id = pg_temp.id(4);
select summit.expire_stale_holds();
select is(pg_temp.jobs(pg_temp.id(4)), array['guest:expired:pending'], 'R2: the hold-expiry job queues "expired"');
delete from summit.email_jobs;
update summit.bookings set status = 'pending', hold_expires_at = now() + interval '48 hours' where id = pg_temp.id(4);
select is(pg_temp.jobs(pg_temp.id(4)), array['guest:received:pending'], 'R2: reopening an expired request queues "received"');

-- ---------------------------------------------------------------- R3: dates, address, token
select pg_temp.book(pg_temp.id(5), 3040, 'confirmed', 'guest5@example.test');
delete from summit.email_jobs;
update summit.bookings set check_in = check_in + 1, check_out = check_out + 1 where id = pg_temp.id(5);
select is(pg_temp.jobs(pg_temp.id(5)), array['guest:dates_changed:pending'], 'R3: moving the dates queues "dates_changed"');
delete from summit.email_jobs;
update summit.bookings set email = 'New5@Example.test' where id = pg_temp.id(5);
select is(
  pg_temp.jobs(pg_temp.id(5)),
  array['guest:address_fixed:pending', 'guest_notice:address_fixed:pending:guest5@example.test'],
  'R3: a new address queues "address_fixed" and a notice to the old address'
);
delete from summit.email_jobs;
update summit.bookings set email = 'NEW5@example.test' where id = pg_temp.id(5);
select is(pg_temp.jobs(pg_temp.id(5)), '{}'::text[], 'R3: a change of letter case only is not a new address');
update summit.bookings set manage_token = repeat('a', 36) where id = pg_temp.id(5);
select is(pg_temp.jobs(pg_temp.id(5)), array['guest:fresh_link:pending'], 'R3: a new token alone queues "fresh_link"');

-- ---------------------------------------------------------------- R4: supersede
select pg_temp.book(pg_temp.id(6), 3050, 'pending', 'guest6@example.test');
update summit.bookings set status = 'confirmed' where id = pg_temp.id(6);
select results_eq(
  format($$ select event, status::text, coalesce(last_error, '') from summit.email_jobs where booking_id = %L order by event $$, pg_temp.id(6)),
  $$ values ('confirmed', 'pending', ''), ('received', 'not_sent', 'superseded') $$,
  'R4: a newer guest email replaces the older one still waiting'
);

-- ---------------------------------------------------------------- R5: the guest-email rule
select pg_temp.book(pg_temp.id(7), 3060, 'pending', 'guest7@example.test', 'website', false);
select is(pg_temp.jobs(pg_temp.id(7)), '{}'::text[], 'R5: email_guest off queues nothing');
select pg_temp.book(pg_temp.id(8), 3070, 'confirmed', 'SUMMIT-Owner@Test.cwr', 'owner');
update summit.bookings set email = 'other8@example.test' where id = pg_temp.id(8);
select is(
  pg_temp.jobs(pg_temp.id(8)),
  array['guest:address_fixed:pending'],
  'R5: an owner-entered stay under an owner address (any case) gets no guest email, and its old address no notice'
);
select pg_temp.book(pg_temp.id(9), 3080, 'pending', 'Summit-Owner@test.CWR');
select is(pg_temp.jobs(pg_temp.id(9)), array['guest:received:pending'], 'R5: a website request under an owner address is emailed');

-- ---------------------------------------------------------------- R6: owner alerts
select pg_temp.book(pg_temp.id(10), 3090, 'pending', 'guest10@example.test');
select is(pg_temp.jobs(pg_temp.id(10)), array['guest:received:pending'], 'R6: no owner alert without owner_alert_to');
update summit.email_settings set owner_alert_to = array['alerts@test.cwr']::extensions.citext[];
select pg_temp.book(pg_temp.id(11), 3100, 'pending', 'guest11@example.test');
select is(pg_temp.jobs(pg_temp.id(11)), array['guest:received:pending', 'owner_alert:received:pending'], 'R6: a website request alerts the owners');
delete from summit.email_jobs;
update summit.bookings set status = 'confirmed' where id = pg_temp.id(11);
select is(pg_temp.jobs(pg_temp.id(11)), array['guest:confirmed:pending'], 'R6: an owner decision does not alert the owners');
delete from summit.email_jobs;
update summit.bookings set check_in = check_in + 1, check_out = check_out + 1 where id = pg_temp.id(11);
select is(pg_temp.jobs(pg_temp.id(11)), array['guest:dates_changed:pending', 'owner_alert:dates_changed:pending'], 'R6: a date move alerts the owners');
delete from summit.email_jobs;
update summit.bookings set email = 'new11@example.test' where id = pg_temp.id(11);
select is(
  pg_temp.jobs(pg_temp.id(11)),
  array['guest:address_fixed:pending', 'guest_notice:address_fixed:pending:guest11@example.test', 'owner_alert:address_fixed:pending'],
  'R6: an address fix alerts the owners'
);
delete from summit.email_jobs;
update summit.bookings set status = 'cancelled', cancelled_by = 'guest' where id = pg_temp.id(11);
select is(pg_temp.jobs(pg_temp.id(11)), array['guest:cancelled:pending', 'owner_alert:cancelled:pending'], 'R6: a guest cancelling alerts the owners');
delete from summit.email_jobs;
update summit.bookings set status = 'cancelled', cancelled_by = 'guest' where id = pg_temp.id(11);
select is(pg_temp.jobs(pg_temp.id(11)), '{}'::text[], 'R6: a later update of a cancelled stay alerts no one');
select pg_temp.book(pg_temp.id(12), 3110, 'confirmed', 'guest12@example.test', 'owner');
select is(pg_temp.jobs(pg_temp.id(12)), array['guest:confirmed:pending'], 'R6: an owner-entered stay does not alert the owners');
update summit.email_settings set owner_alert_to = null;

-- ---------------------------------------------------------------- R7, R10: claim, finish, expiry, updated_at
delete from summit.email_jobs;
select pg_temp.book(pg_temp.id(13), 3120, 'pending', 'guest13@example.test', 'website', false);
-- Fixture rows: inserts do not fire the BEFORE UPDATE trigger, so updated_at starts a day old.
insert into summit.email_jobs (id, kind, booking_id, event, updated_at)
values (pg_temp.id(101), 'guest', pg_temp.id(13), 'received', now() - interval '1 day');

update summit.email_settings set is_live = false;
select is(summit.claim_email_jobs(10), '[]'::jsonb, 'R7: nothing is claimed while sending is off');
update summit.email_settings set is_live = true;
select is(jsonb_array_length(summit.claim_email_jobs(10)), 1, 'R7: a due job is claimed');
select results_eq(
  format($$ select status::text, attempts, updated_at = now() from summit.email_jobs where id = %L $$, pg_temp.id(101)),
  $$ values ('working', 1, true) $$,
  'R7, R10: a claim marks the job working, counts the attempt and stamps updated_at'
);

create function pg_temp.retry_ladder()
returns text[]
language plpgsql
as $$
declare
  v_steps text[] := '{}';
  v_status text;
begin
  for v_attempt in 1..5 loop
    update summit.email_jobs set status = 'working', attempts = v_attempt where id = pg_temp.id(101);
    v_status := summit.finish_email_job(pg_temp.id(101), 'retry', 'temporary');
    v_steps := v_steps || (v_status || ':' || (select extract(epoch from next_attempt_at - now())::integer / 60 from summit.email_jobs where id = pg_temp.id(101)));
  end loop;
  return v_steps;
end;
$$;
select is(
  pg_temp.retry_ladder(),
  array['pending:1', 'pending:5', 'pending:15', 'pending:60', 'failed:60'],
  'R7: retries after 1, 5, 15 and 60 minutes, then fails after the 5th try'
);

insert into summit.email_jobs (id, kind, booking_id, event, status, attempts, claimed_at, updated_at)
values (pg_temp.id(102), 'guest', pg_temp.id(13), 'received', 'working', 1, now(), now() - interval '1 day');
select is(summit.finish_email_job(pg_temp.id(102), 'done', null, 'ms-123'), 'done', 'R7: a sent email is done');
select results_eq(
  format($$ select provider_message_id, last_error is null, updated_at = now() from summit.email_jobs where id = %L $$, pg_temp.id(102)),
  $$ values ('ms-123', true, true) $$,
  'R7, R10: finishing keeps MailerSend''s message id and stamps updated_at'
);
select throws_ok(
  format($$ select summit.finish_email_job(%L, 'maybe') $$, pg_temp.id(102)),
  '22023', null, 'R7: an unknown outcome is refused'
);

delete from summit.email_jobs;
insert into summit.email_jobs (id, kind, booking_id, event, expires_at, updated_at) values
  (pg_temp.id(103), 'owner_alert', pg_temp.id(13), 'received', now() - interval '1 minute', now() - interval '1 day');
insert into summit.email_jobs (id, kind, booking_id, event, status, attempts, claimed_at) values
  (pg_temp.id(104), 'guest', pg_temp.id(13), 'received', 'working', 1, now() - interval '11 minutes'),
  (pg_temp.id(105), 'guest', pg_temp.id(13), 'received', 'working', 1, now() - interval '11 minutes');
update summit.email_jobs set expires_at = now() - interval '1 minute' where id = pg_temp.id(105);
select is(
  (select array_agg(j ->> 'id' order by j ->> 'id') from jsonb_array_elements(summit.claim_email_jobs(10)) j),
  array[pg_temp.id(104)::text],
  'R7: a stale claim is claimed again, but not one past its deadline'
);
select results_eq(
  format($$ select id, status::text, last_error from summit.email_jobs where id in (%L, %L) order by id $$, pg_temp.id(103), pg_temp.id(105)),
  format($$ values (%L::uuid, 'not_sent', 'expired'), (%L::uuid, 'not_sent', 'expired') $$, pg_temp.id(103), pg_temp.id(105)),
  'R7: any kind of email past its deadline expires, including a stale claim'
);
select is(
  (select updated_at = now() from summit.email_jobs where id = pg_temp.id(103)),
  true,
  'R10: expiry stamps updated_at'
);

delete from summit.email_jobs;
update summit.email_settings set daily_limit = 1;
insert into summit.email_jobs (kind, booking_id, event, status) values ('guest', pg_temp.id(13), 'received', 'done');
insert into summit.email_jobs (kind, booking_id, event) values ('guest', pg_temp.id(13), 'received');
select is(summit.claim_email_jobs(10), '[]'::jsonb, 'R7: nothing is claimed once the daily limit is reached');
update summit.email_settings set daily_limit = 200;

update summit.email_settings set is_live = false, worker_url = 'http://worker.test/functions/v1/summit-email-worker';
select summit.post_email_worker();
select summit.wake_email_worker();
select is(
  (select count(*)::int from net.http_request_queue where url = 'http://worker.test/functions/v1/summit-email-worker'),
  0,
  'R7: neither a direct wake-up nor the sweep posts while sending is off'
);
update summit.email_settings set is_live = true;
select summit.wake_email_worker();
select is(
  (select count(*)::int from net.http_request_queue where url = 'http://worker.test/functions/v1/summit-email-worker'),
  1,
  'R7: the sweep wakes the worker when sending is on and an email is due'
);
update summit.email_settings set is_live = false, worker_url = null;
delete from summit.email_jobs;
insert into summit.email_jobs (id, kind, booking_id, event, expires_at) values
  (pg_temp.id(106), 'guest', pg_temp.id(13), 'received', now() - interval '1 minute');
select summit.wake_email_worker();
select is(
  (select status::text || ':' || last_error from summit.email_jobs where id = pg_temp.id(106)),
  'not_sent:expired',
  'R7: the sweep expires waiting emails even while sending is off'
);
select throws_ok(
  $$ update summit.email_settings set worker_url = 'worker.test/x' $$,
  '23514', null, 'R7: worker_url must start with http:// or https://'
);

update summit.email_settings set is_live = true;
delete from summit.email_jobs;
insert into summit.email_jobs (id, kind, booking_id, event, updated_at)
values (pg_temp.id(107), 'guest', pg_temp.id(6), 'received', now() - interval '1 day');
update summit.bookings set status = 'declined' where id = pg_temp.id(6);
select results_eq(
  format($$ select status::text, last_error, updated_at = now() from summit.email_jobs where id = %L $$, pg_temp.id(107)),
  $$ values ('not_sent', 'superseded', true) $$,
  'R4, R10: superseding stamps updated_at'
);

-- ---------------------------------------------------------------- R8: "Email me my link"
delete from summit.email_jobs;
select pg_temp.book(pg_temp.id(20), 3200, 'pending', 'Link.Guest@Example.test');
insert into summit.bookings (id, check_in, check_out, guests, occasion, name, email, phone, status)
values (pg_temp.id(21), current_date - 10, current_date - 5, 2, 'Other', 'Past Guest', 'past@example.test', '5550001111', 'confirmed');
select pg_temp.book(pg_temp.id(22), 3210, 'declined', 'closed@example.test');
select pg_temp.book(pg_temp.id(23), 3220, 'confirmed', 'off@example.test', 'website', false);
select pg_temp.book(pg_temp.id(24), 3230, 'confirmed', 'summit-owner@test.cwr', 'owner');
select pg_temp.book(pg_temp.id(25), 3240, 'pending', 'two@example.test');
select pg_temp.book(pg_temp.id(26), 3250, 'pending', 'three@example.test');
select pg_temp.book(pg_temp.id(27), 3260, 'pending', 'late@example.test');
delete from summit.email_jobs;

-- One request; returns how the row it added was recorded, or a failure if it added other than one row.
create function pg_temp.ask(p_email text, p_ip text)
returns text
language plpgsql
as $$
declare
  v_before uuid[] := array(select id from summit.email_jobs where kind = 'guest_link');
  v_added text[];
begin
  perform summit.queue_link_email(p_email::extensions.citext, p_ip::inet);
  v_added := array(
    select status::text || coalesce(':' || last_error, '') from summit.email_jobs
    where kind = 'guest_link' and not (id = any (v_before))
  );
  if cardinality(v_added) <> 1 then
    return 'added ' || cardinality(v_added) || ' rows';
  end if;
  return v_added[1];
end;
$$;

select is(
  (select prorettype = 'void'::regtype from pg_proc where oid = 'summit.queue_link_email(extensions.citext, inet)'::regprocedure),
  true,
  'R8: queue_link_email returns nothing'
);
select is(pg_temp.ask('link.guest@EXAMPLE.test', '10.0.0.1'), 'pending', 'R8: a mixed-case address with an upcoming stay gets one link email');
select is(pg_temp.ask('Link.Guest@Example.test', '10.0.0.2'), 'not_sent:capped', 'R8: a second request within 10 minutes is refused, still as one row');
select is(
  array[pg_temp.ask('past@example.test', '10.0.0.3'), pg_temp.ask('closed@example.test', '10.0.0.3'),
        pg_temp.ask('off@example.test', '10.0.0.3')],
  array['not_sent:no_match', 'not_sent:no_match', 'not_sent:no_match'],
  'R8: past, closed and switched-off stays get no link'
);
select is(
  array[pg_temp.ask('nobody1@example.test', '10.0.0.3'), pg_temp.ask('nobody2@example.test', '10.0.0.3'), pg_temp.ask('nobody3@example.test', '10.0.0.3')],
  array['not_sent:no_match', 'not_sent:no_match', 'not_sent:capped'],
  'R8: a 6th request from one IP in an hour is refused'
);

insert into summit.link_requests (email, source_ip, created_at) values
  ('two@example.test', '10.1.0.1', now() - interval '1 hour'), ('two@example.test', '10.1.0.1', now() - interval '2 hours'),
  ('three@example.test', '10.1.0.2', now() - interval '1 hour'), ('three@example.test', '10.1.0.2', now() - interval '2 hours'),
  ('three@example.test', '10.1.0.2', now() - interval '3 hours');
select is(pg_temp.ask('two@example.test', '10.0.1.1'), 'pending', 'R8: a 3rd request in 24 hours is sent');
select is(pg_temp.ask('three@example.test', '10.0.1.2'), 'not_sent:capped', 'R8: a 4th request in 24 hours is refused (every request counts)');

create function pg_temp.ask_unknown_50()
returns integer
language plpgsql
as $$
begin
  for v_n in 1..50 loop
    perform pg_temp.ask('unknown' || v_n || '@example.test', '10.2.0.' || v_n);
  end loop;
  return (select count(*)::int from summit.email_jobs where kind = 'guest_link' and last_error = 'no_match');
end;
$$;
select cmp_ok(pg_temp.ask_unknown_50(), '>=', 50, 'R8: 50 requests for unknown addresses are each recorded as no_match');
select is(pg_temp.ask('late@example.test', '10.0.2.1'), 'pending', 'R8: no_match requests do not use up the site-wide cap');
insert into summit.email_jobs (kind, event, recipient_email, status)
select 'guest_link', 'link_requested', 'sent' || n || '@example.test', 'done' from generate_series(1, 50) n;
delete from summit.link_requests where lower(email::text) = 'link.guest@example.test';
select is(pg_temp.ask('link.guest@example.test', '10.0.2.2'), 'not_sent:capped', 'R8: 50 queued link emails in 24 hours stop further ones');

update summit.email_settings set is_live = false;
select is(pg_temp.ask('LATE@example.test', '10.0.2.3'), 'not_sent:off', 'R8: while sending is off a request is recorded as one not_sent row');
update summit.email_settings set is_live = true;

-- ---------------------------------------------------------------- R9: replacing the link
select pg_temp.book(pg_temp.id(30), 3300, 'pending', 'rot@example.test');
select pg_temp.book(pg_temp.id(31), 3310, 'pending', 'rot-off@example.test', 'website', false);
select pg_temp.book(pg_temp.id(32), 3320, 'confirmed', 'rot-owner@example.test', 'owner');
select pg_temp.book(pg_temp.id(33), 3330, 'pending', 'rot-site@example.test');

create temporary table rotated as select * from summit.rotate_manage_token(pg_temp.id(30));
select results_eq(
  format($$ select r.outcome, r.token ~ '^[0-9a-f]{36}$', r.token = b.manage_token from rotated r, summit.bookings b where b.id = %L $$, pg_temp.id(30)),
  $$ values ('ok', true, true) $$,
  'R9: a rotation returns ok and the booking''s new 36-character token'
);
select ok(
  exists (
    select 1 from pg_locks
    where locktype = 'advisory' and pid = pg_backend_pid()
      and objid::bigint = (hashtext('summit_rotate:' || pg_temp.id(30)::text)::bigint & 4294967295)
  ),
  'R9: a rotation holds the per-booking advisory lock until the transaction ends'
);
select is((select outcome from summit.rotate_manage_token(pg_temp.id(30), 'New.Rot@example.test')), 'ok', 'R9: a rotation with a new address is allowed');
select is((select email::text from summit.bookings where id = pg_temp.id(30)), 'New.Rot@example.test', 'R9: a rotation with an address sets it');
select is((select outcome from summit.rotate_manage_token(pg_temp.id(30))), 'ok', 'R9: a 3rd rotation in 24 hours is allowed');
create temporary table token_before as select manage_token from summit.bookings where id = pg_temp.id(30);
select is((select outcome from summit.rotate_manage_token(pg_temp.id(30))), 'too_many_link_changes', 'R9: a 4th rotation in 24 hours is refused');
select results_eq(
  format($$ select (select count(*)::int from summit.token_rotations where booking_id = %L), (select manage_token from summit.bookings where id = %L) = (select manage_token from token_before) $$, pg_temp.id(30), pg_temp.id(30)),
  $$ values (4, true) $$,
  'R9: every attempt is recorded and a refused one changes nothing'
);
select is(
  array[
    (select outcome from summit.rotate_manage_token(pg_temp.id(31))),
    (select outcome from summit.rotate_manage_token(pg_temp.id(32), 'SUMMIT-OWNER@test.cwr')),
    (select outcome from summit.rotate_manage_token(pg_temp.id(33), 'Summit-Owner@Test.cwr'))
  ],
  array['email_off', 'email_off', 'ok'],
  'R9: refused when email_guest is off or an owner-entered stay moves to an owner address; a website stay may move anywhere'
);
select results_eq(
  format($$ select email::text, (select count(*)::int from summit.token_rotations where booking_id = %L) from summit.bookings where id = %L $$, pg_temp.id(32), pg_temp.id(32)),
  $$ values ('rot-owner@example.test', 1) $$,
  'R9: a refused move keeps the address but still counts as an attempt'
);
update summit.email_settings set is_live = false;
select is((select outcome from summit.rotate_manage_token(pg_temp.id(31))), 'email_off', 'R9: while sending is off a rotation is refused');
select is((select count(*)::int from summit.token_rotations where booking_id = pg_temp.id(31)), 1, 'R9: a refusal while sending is off is not recorded');
select is(summit.will_email_guest(pg_temp.id(33)), false, 'R9: will_email_guest is false while sending is off');
update summit.email_settings set is_live = true;
select pg_temp.book(pg_temp.id(34), 3340, 'confirmed', 'Summit-OWNER@test.cwr', 'owner');
select is(
  array[summit.will_email_guest(pg_temp.id(31)), summit.will_email_guest(pg_temp.id(34)),
        summit.will_email_guest(pg_temp.id(33)), summit.will_email_guest(pg_temp.id(1))],
  array[false, false, true, true],
  'R9: will_email_guest is false for email_guest off and an owner-entered owner address; true for a website stay under one and an ordinary stay'
);

-- ---------------------------------------------------------------- R10: rights
select is(
  (select count(*)::int from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'summit'),
  0,
  'R10: the public key has no table rights in summit'
);
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'summit' and has_function_privilege('anon', p.oid, 'execute')),
  array['get_unavailable_ranges']::text[],
  'R10: the public key can still call only the calendar function'
);
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'summit' and has_function_privilege('authenticated', p.oid, 'execute')),
  array['generate_booking_reference', 'get_unavailable_ranges', 'is_admin', 'list_owners', 'remove_owner', 'set_owner_alerts']::text[],
  'R10: signed-in users can call none of the new functions'
);
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'summit' and p.proname in (
     'email_is_live', 'will_email_guest', 'get_email_worker_secret', 'rotate_manage_token', 'queue_link_email',
     'claim_email_jobs', 'finish_email_job', 'post_email_worker', 'wake_email_worker', 'purge_email_jobs', 'get_link_refusal'
   ) and has_function_privilege('service_role', p.oid, 'execute')),
  array['claim_email_jobs', 'email_is_live', 'finish_email_job', 'get_email_worker_secret', 'queue_link_email', 'rotate_manage_token', 'will_email_guest']::text[],
  'R10: the Edge Functions can call exactly the functions they need'
);

insert into auth.users (id, email) values ('f3000000-0000-0000-0000-0000000000aa', 'summit-owner@test.cwr') on conflict do nothing;
select pg_temp.sign_in_as_summit_owner();
set local role authenticated;
select results_eq(
  $$ select (select count(*)::int from summit.email_settings), (select count(*) > 0 from summit.email_jobs) $$,
  $$ values (1, true) $$,
  'R10: a 623 owner reads the settings and the queue'
);
select throws_ok(
  $$ insert into summit.email_jobs (kind, booking_id, event) values ('guest', 'f3000000-0000-0000-0000-000000000001', 'received') $$,
  '42501', null, 'R10: a 623 owner cannot add to the queue'
);
select throws_ok($$ select count(*) from summit.link_requests $$, '42501', null, 'R10: signed-in users cannot read link requests');
reset role;
select set_config('request.jwt.claims', jsonb_build_object('sub', '55555555-5555-5555-5555-555555555555', 'role', 'authenticated')::text, true);
set local role authenticated;
select results_eq(
  $$ select (select count(*)::int from summit.email_settings), (select count(*)::int from summit.email_jobs) $$,
  $$ values (0, 0) $$,
  'R10: someone not on the 623 owner list sees neither'
);
reset role;
select lives_ok($$ select summit.record_lookup('10.9.0.1', 'resend') $$, 'R10: a lookup may be recorded as a resend');

-- ---------------------------------------------------------------- R11: purge
delete from summit.email_jobs;
delete from summit.link_requests;
delete from summit.token_rotations;
insert into summit.email_jobs (kind, booking_id, event, created_at) values
  ('guest', pg_temp.id(13), 'received', now() - interval '31 days'),
  ('guest', pg_temp.id(13), 'confirmed', now() - interval '29 days');
insert into summit.link_requests (email, created_at) values ('old@example.test', now() - interval '31 days'), ('new@example.test', now() - interval '29 days');
insert into summit.token_rotations (booking_id, created_at) values (pg_temp.id(13), now() - interval '31 days'), (pg_temp.id(13), now() - interval '29 days');
insert into cron.job_run_details (jobid, runid, job_pid, database, username, command, status, return_message, start_time, end_time)
select j.jobid, (select coalesce(max(runid), 0) from cron.job_run_details) + row_number() over (order by j.jobname, a.age), 0, 'postgres', 'postgres', j.command, 'succeeded', 'test-300',
       now() - a.age, now() - a.age
from cron.job j cross join (values (interval '8 days'), (interval '6 days')) a(age)
where j.jobname in ('summit_email_sweep', 'cwr_email_sweep');
select summit.purge_email_jobs();
select results_eq(
  $$ select (select array_agg(event order by event) from summit.email_jobs),
            (select array_agg(email::text) from summit.link_requests),
            (select count(*)::int from summit.token_rotations) $$,
  $$ values (array['confirmed'], array['new@example.test'], 1) $$,
  'R11: jobs (whatever their status), link requests and rotations older than 30 days are deleted, newer ones kept'
);
select results_eq(
  $$ select j.jobname::text, extract(day from now() - d.end_time)::int from cron.job_run_details d join cron.job j using (jobid)
     where d.return_message = 'test-300' order by 1, 2 $$,
  $$ values ('cwr_email_sweep', 6), ('cwr_email_sweep', 8), ('summit_email_sweep', 6) $$,
  'R11: only 623''s own scheduled-job history older than 7 days is deleted'
);
select is(
  (select array_agg(jobname::text order by jobname) from cron.job where jobname in ('summit_email_sweep', 'summit_purge_email_jobs')),
  array['summit_email_sweep', 'summit_purge_email_jobs']::text[],
  'R11: the sweep and the purge are scheduled'
);

select * from finish();
rollback;

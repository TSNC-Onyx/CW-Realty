-- 623 Summit lives in the `summit` schema of this project (docs/runbooks/summit-shared-database.md).
-- These tests prove the two sites cannot see each other and that 623's booking rules survived the move.
begin;
select plan(17);
select cwr_test.create_fixture();

-- cwr_test.sign_in carries no email, and summit.is_admin() reads the email claim, so this file
-- signs in with its own claims. Kept here so the shared helpers stay CW-only.
create function pg_temp.sign_in_as_summit_owner()
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', 'f2700000-0000-0000-0000-0000000000aa', 'email', 'summit-owner@test.cwr', 'role', 'authenticated', 'aal', 'aal1')::text,
    true
  );
$$;

-- A login with no CW membership at all: the shape of every 623 owner.
insert into auth.users (id, email) values ('f2700000-0000-0000-0000-0000000000aa', 'summit-owner@test.cwr');
insert into summit.admins (email, label) values ('summit-owner@test.cwr', 'Test owner');
insert into summit.bookings (id, check_in, check_out, guests, occasion, name, email, phone, status)
values ('f2700000-0000-0000-0000-000000000001', current_date + 30, current_date + 33, 2, 'Family stay', 'Test Guest', 'guest@example.test', '5550001111', 'confirmed');

-- ---------------------------------------------------------------- schema shape
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'summit' and c.relkind = 'r' and c.relrowsecurity),
  6,
  'All six 623 tables have row level security on'
);

select is(
  (select count(*)::int from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'summit'),
  0,
  'The public key has no table rights in summit'
);

select is(
  (select array_agg(table_name || ':' || privilege_type order by table_name, privilege_type)
   from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'summit'),
  array[
    'admins:SELECT',
    'blackouts:DELETE', 'blackouts:INSERT', 'blackouts:SELECT', 'blackouts:UPDATE',
    'booking_payments:DELETE', 'booking_payments:INSERT', 'booking_payments:SELECT',
    'bookings:DELETE', 'bookings:INSERT', 'bookings:SELECT', 'bookings:UPDATE',
    'inquiries:DELETE', 'inquiries:INSERT', 'inquiries:SELECT', 'inquiries:UPDATE',
    'lookup_events:SELECT'
  ]::text[],
  'Signed-in users get exactly the table rights 623 grants, and row level security narrows them to owners'
);

select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'summit' and has_function_privilege('anon', p.oid, 'execute')),
  array['get_unavailable_ranges']::text[],
  'The public key can call only the calendar function'
);

select is(
  (select array_agg(jobname::text order by jobname) from cron.job where jobname like 'summit\_%'),
  array['summit_expire_stale_holds', 'summit_purge_old_technical_data']::text[],
  'Exactly two 623 scheduled jobs, named so the CW job watcher ignores them'
);

select is(
  (select count(*)::int from cron.job where jobname like 'cwr\_%' and command like '%summit.%'),
  0,
  'No CW scheduled job reaches into summit'
);

-- ---------------------------------------------------------------- a CW member cannot see 623
select cwr_test.sign_in('owner');
set local role authenticated;
select is(summit.is_admin(), false, 'A CW owner is not a 623 owner');
select is(
  array[
    (select count(*)::int from summit.bookings), (select count(*)::int from summit.inquiries),
    (select count(*)::int from summit.blackouts), (select count(*)::int from summit.admins),
    (select count(*)::int from summit.booking_payments), (select count(*)::int from summit.lookup_events)
  ],
  array[0, 0, 0, 0, 0, 0],
  'A CW owner sees no 623 rows'
);
reset role;

-- ---------------------------------------------------------------- a 623 owner cannot see CW
select pg_temp.sign_in_as_summit_owner();
set local role authenticated;
select is(summit.is_admin(), true, 'A 623 owner passes the 623 owner check');
select is((select count(*)::int from summit.bookings), 1, 'A 623 owner sees 623 bookings');
select is(
  array[
    (select count(*)::int from cwr.inbox_threads), (select count(*)::int from cwr.memberships),
    (select count(*)::int from cwr.audit_log), (select count(*)::int from cwr.listings where id = cwr_test.id('draft_listing'))
  ],
  array[0, 0, 0, 0],
  'A 623 owner sees no CW inbox, team, audit history, or unpublished listings'
);
reset role;

-- ---------------------------------------------------------------- the public key
select cwr_test.sign_out();
set local role anon;
select throws_ok('select count(*) from summit.bookings', '42501', null, 'The public key cannot read bookings');
select throws_ok('select total_amount from summit.bookings', '42501', null, 'The public key cannot read the agreed price');
select throws_ok('select count(*) from summit.booking_payments', '42501', null, 'The public key cannot read payments');
reset role;

-- ---------------------------------------------------------------- 623 booking rules
select throws_ok(
  $$insert into summit.bookings (check_in, check_out, guests, occasion, name, email, phone, status)
    values (current_date + 31, current_date + 35, 2, 'Other', 'Second Guest', 'second@example.test', '5550002222', 'confirmed')$$,
  '23P01',
  null,
  'Two confirmed stays cannot overlap'
);

insert into summit.bookings (check_in, check_out, guests, occasion, name, email, phone, status, hold_expires_at)
values (current_date + 60, current_date + 63, 2, 'Other', 'Lapsed Hold', 'lapsed@example.test', '5550003333', 'pending', now() - interval '1 hour');
select is(
  summit.is_range_available(current_date + 60, current_date + 63, null),
  true,
  'An expired hold does not block its dates'
);

select is(
  summit.is_range_available(current_date + 30, current_date + 33, null),
  false,
  'A confirmed stay blocks its dates'
);

select * from finish();
rollback;

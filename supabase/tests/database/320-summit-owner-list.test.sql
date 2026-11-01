-- 623 Summit: the console's Owners tab (20261101000100_summit_owner_list.sql; 623Summit repo,
-- docs/owners-tab-plan.md): who may list owners, choose booking alerts and remove an owner.
begin;
select plan(29);

update summit.email_settings set is_live = false, owner_alert_to = null;

-- Three owners (signed in, invite not opened, no login yet) and one login that is not an owner.
insert into auth.users (id, email, email_confirmed_at, last_sign_in_at, encrypted_password)
values ('f3200000-0000-0000-0000-00000000000a', 'owner-a@test.summit', now(), '2026-10-30 09:00+00', 'set');
insert into auth.users (id, email, invited_at, confirmation_sent_at)
values ('f3200000-0000-0000-0000-00000000000b', 'invited-b@test.summit', '2026-10-31 10:00+00', '2026-10-31 10:00+00');
insert into auth.users (id, email, email_confirmed_at, encrypted_password)
values ('f3200000-0000-0000-0000-00000000000d', 'outsider-d@test.summit', now(), 'set');
insert into summit.admins (email, created_at, label) values
  ('owner-a@test.summit', '2026-10-23 00:00+00', 'Owner'),
  ('invited-b@test.summit', '2026-10-31 10:00+00', 'Invited by owner-a@test.summit'),
  ('nologin-c@test.summit', '2026-11-01 00:00+00', 'Invited by owner-a@test.summit');

create function pg_temp.sign_in_as(p_id text, p_email text)
returns void
language sql
as $$
  select set_config('request.jwt.claims',
    jsonb_build_object('sub', p_id, 'role', 'authenticated', 'email', p_email)::text, true);
$$;

create function pg_temp.alert_list()
returns text[]
language sql
as $$
  select coalesce((select owner_alert_to::text[] from summit.email_settings where id), '{}');
$$;

-- ---------------------------------------------------------------------------
-- Rights
-- ---------------------------------------------------------------------------

select has_function('summit', 'list_owners', array[]::text[], 'list_owners exists');
select has_function('summit', 'set_owner_alerts', array['text', 'boolean'], 'set_owner_alerts exists');
select has_function('summit', 'remove_owner', array['text'], 'remove_owner exists');

select ok(not has_function_privilege('anon', 'summit.list_owners()', 'execute'), 'visitors cannot list owners');
select ok(not has_function_privilege('anon', 'summit.set_owner_alerts(text, boolean)', 'execute'), 'visitors cannot change alerts');
select ok(not has_function_privilege('anon', 'summit.remove_owner(text)', 'execute'), 'visitors cannot remove owners');
select ok(has_function_privilege('authenticated', 'summit.list_owners()', 'execute'), 'signed-in users may call list_owners');
select ok(has_function_privilege('authenticated', 'summit.set_owner_alerts(text, boolean)', 'execute'), 'signed-in users may call set_owner_alerts');
select ok(has_function_privilege('authenticated', 'summit.remove_owner(text)', 'execute'), 'signed-in users may call remove_owner');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'summit' and p.proname in ('list_owners', 'set_owner_alerts', 'remove_owner')
      and p.prosecdef and p.proconfig @> array['search_path=""']),
  3, 'all three run as the definer with an empty search_path');

-- ---------------------------------------------------------------------------
-- An owner lists the owners
-- ---------------------------------------------------------------------------

select pg_temp.sign_in_as('f3200000-0000-0000-0000-00000000000a', 'owner-a@test.summit');
set local role authenticated;

select results_eq(
  $$ select email, is_you, is_invited, last_signed_in_at is not null, invite_sent_at, gets_alerts
       from summit.list_owners() where email like '%@test.summit' $$,
  $$ values ('owner-a@test.summit', true, false, true, null::timestamptz, false),
            ('invited-b@test.summit', false, true, false, '2026-10-31 10:00+00'::timestamptz, false),
            ('nologin-c@test.summit', false, true, false, null::timestamptz, false) $$,
  'an owner sees every owner, themselves first, with who has opened their invite');
select is((select email from summit.list_owners() limit 1), 'owner-a@test.summit', 'the caller comes first');

-- ---------------------------------------------------------------------------
-- Booking alerts
-- ---------------------------------------------------------------------------

select is(summit.set_owner_alerts('invited-b@test.summit', true), true, 'ticking alerts answers true');
select lives_ok($$ select summit.set_owner_alerts('INVITED-B@test.summit', true) $$, 'ticking again in another case is accepted');
reset role;
select is(pg_temp.alert_list(), array['invited-b@test.summit'], '... and the address is listed once');
set local role authenticated;
select is((select gets_alerts from summit.list_owners() where email = 'invited-b@test.summit'), true,
  'the list shows who gets alerts');
select is(summit.set_owner_alerts('invited-b@test.summit', false), true, 'unticking answers true');
reset role;
select is(pg_temp.alert_list(), array[]::text[], '... and takes the address off');
set local role authenticated;
select throws_ok($$ select summit.set_owner_alerts('outsider-d@test.summit', true) $$, '42501', 'not_owner',
  'alerts go only to owners');

-- ---------------------------------------------------------------------------
-- Removing an owner
-- ---------------------------------------------------------------------------

select throws_ok($$ select summit.remove_owner('Owner-A@test.summit') $$, 'P0001', 'cannot_remove_self',
  'an owner cannot remove themselves');
select throws_ok($$ select summit.remove_owner('nobody@test.summit') $$, 'P0002', 'not_found',
  'removing someone who is not an owner says so');

select summit.set_owner_alerts('nologin-c@test.summit', true);
select is(summit.remove_owner('nologin-c@test.summit'), true, 'removing an owner answers true');
reset role;
select ok(not exists (select 1 from summit.admins where email = 'nologin-c@test.summit')
  and pg_temp.alert_list() = array[]::text[], '... takes them off the list and off booking alerts');

-- Their owner-entered bookings stop being kept quiet (accepted in the plan's Decisions).
select is(summit.is_guest_email_allowed(true, 'owner', 'invited-b@test.summit'), false,
  'an owner''s own address gets no guest email on an owner-entered booking');
select pg_temp.sign_in_as('f3200000-0000-0000-0000-00000000000a', 'owner-a@test.summit');
set local role authenticated;
select summit.remove_owner('invited-b@test.summit');
reset role;
select is(summit.is_guest_email_allowed(true, 'owner', 'invited-b@test.summit'), true,
  '... and does once they are no longer an owner');

-- ---------------------------------------------------------------------------
-- Someone who is not an owner
-- ---------------------------------------------------------------------------

select pg_temp.sign_in_as('f3200000-0000-0000-0000-00000000000d', 'outsider-d@test.summit');
set local role authenticated;
select is((select count(*)::int from summit.list_owners()), 0, 'someone not on the list sees no owners');
select throws_ok($$ select summit.set_owner_alerts('owner-a@test.summit', true) $$, '42501', 'not_owner',
  'someone not on the list cannot change alerts');
select throws_ok($$ select summit.remove_owner('owner-a@test.summit') $$, '42501', 'not_owner',
  'someone not on the list cannot remove an owner');
reset role;

select pg_temp.sign_in_as('f3200000-0000-0000-0000-00000000000b', 'invited-b@test.summit');
set local role authenticated;
select is((select count(*)::int from summit.list_owners()), 0, 'a removed owner sees no owners');
reset role;

select * from finish();
rollback;

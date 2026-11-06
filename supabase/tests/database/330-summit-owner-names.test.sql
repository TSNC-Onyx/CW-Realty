-- 623 Summit: owners' first and last names (20261105000100_summit_owner_names.sql; 623Summit repo,
-- docs/owner-names-plan.md). Names live on the shared login's user_metadata; the database only reads them.
begin;
select plan(12);

-- A named owner, an owner whose name is blank, an owner with no login yet, and a named login that
-- is not an owner.
insert into auth.users (id, email, email_confirmed_at, encrypted_password, raw_user_meta_data) values
  ('f3300000-0000-0000-0000-00000000000a', 'named-a@names.summit', now(), 'set',
   '{"first_name": "Ann", "last_name": "Lee", "avatar": "x"}'),
  ('f3300000-0000-0000-0000-00000000000b', 'blank-b@names.summit', now(), 'set',
   '{"first_name": "  ", "last_name": ""}'),
  ('f3300000-0000-0000-0000-00000000000d', 'outsider-d@names.summit', now(), 'set',
   '{"first_name": "Out", "last_name": "Sider"}');
insert into summit.admins (email, created_at, label) values
  ('named-a@names.summit', '2026-10-01 00:00+00', 'Owner'),
  ('blank-b@names.summit', '2026-10-02 00:00+00', 'Owner'),
  ('nologin-c@names.summit', '2026-10-03 00:00+00', 'Owner');

-- ---------------------------------------------------------------------------
-- Rights
-- ---------------------------------------------------------------------------

select has_function('summit', 'get_owner_login', array['text'], 'get_owner_login exists');
select ok(not has_function_privilege('anon', 'summit.get_owner_login(text)', 'execute'),
  'visitors cannot look up a login');
select ok(not has_function_privilege('authenticated', 'summit.get_owner_login(text)', 'execute'),
  'signed-in users cannot look up a login');
select ok(has_function_privilege('service_role', 'summit.get_owner_login(text)', 'execute'),
  'the service role may look up a login');
select is(
  (select p.provolatile::text from pg_proc p
    where p.pronamespace = 'summit'::regnamespace and p.proname = 'get_owner_login'),
  's', 'get_owner_login is read-only (stable)');
select ok(has_function_privilege('authenticated', 'summit.list_owners()', 'execute'),
  'signed-in users may still call list_owners');

-- ---------------------------------------------------------------------------
-- list_owners() carries the names
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f3300000-0000-0000-0000-00000000000a', 'role', 'authenticated',
    'email', 'named-a@names.summit')::text, true);
set local role authenticated;

select results_eq(
  $$ select email, first_name, last_name from summit.list_owners() where email like '%@names.summit' $$,
  $$ values ('named-a@names.summit', 'Ann', 'Lee'),
            ('blank-b@names.summit', null::text, null::text),
            ('nologin-c@names.summit', null::text, null::text) $$,
  'a named owner shows the name; a blank one and one with no login show none');

reset role;

-- ---------------------------------------------------------------------------
-- get_owner_login()
-- ---------------------------------------------------------------------------

set local role service_role;

select results_eq(
  $$ select user_id, first_name, last_name from summit.get_owner_login('NAMED-A@names.summit') $$,
  $$ values ('f3300000-0000-0000-0000-00000000000a'::uuid, 'Ann', 'Lee') $$,
  'a named owner: the login and the name, in any letter case');
select results_eq(
  $$ select user_id, first_name, last_name from summit.get_owner_login('blank-b@names.summit') $$,
  $$ values ('f3300000-0000-0000-0000-00000000000b'::uuid, null::text, null::text) $$,
  'an owner with a blank name: the login and no name');
select is_empty(
  $$ select * from summit.get_owner_login('nologin-c@names.summit') $$,
  'an owner with no login yet: no row');
select is_empty(
  $$ select * from summit.get_owner_login('outsider-d@names.summit') $$,
  'a login that is not an owner: no row');

reset role;

select is(
  (select raw_user_meta_data from auth.users where id = 'f3300000-0000-0000-0000-00000000000a'),
  '{"first_name": "Ann", "last_name": "Lee", "avatar": "x"}'::jsonb,
  'reading leaves the login untouched');

select * from finish();
rollback;

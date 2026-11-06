-- 623 Summit: what the console relies on in list_owners() (623Summit repo, docs/owner-names-plan.md).
-- Its first seven columns keep their names and order, and the caller comes first, then the other
-- owners by owner since. Written before 20261105000100_summit_owner_names.sql and passes either side of it.
begin;
select plan(3);

insert into auth.users (id, email, email_confirmed_at, encrypted_password) values
  ('f3250000-0000-0000-0000-00000000000a', 'first-a@order.summit', now(), 'set'),
  ('f3250000-0000-0000-0000-00000000000b', 'middle-b@order.summit', now(), 'set'),
  ('f3250000-0000-0000-0000-00000000000c', 'last-c@order.summit', now(), 'set');
insert into summit.admins (email, created_at, label) values
  ('first-a@order.summit', '2026-10-01 00:00+00', 'Owner'),
  ('middle-b@order.summit', '2026-10-02 00:00+00', 'Owner'),
  ('last-c@order.summit', '2026-10-03 00:00+00', 'Owner');

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

select is(
  (select (p.proargnames)[1:7] from pg_proc p
    where p.pronamespace = 'summit'::regnamespace and p.proname = 'list_owners'),
  array['email', 'owner_since', 'last_signed_in_at', 'invite_sent_at', 'is_invited', 'gets_alerts', 'is_you'],
  'the first seven columns keep their names and order');

-- ---------------------------------------------------------------------------
-- Row order, seen by the owner added second
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f3250000-0000-0000-0000-00000000000b', 'role', 'authenticated',
    'email', 'middle-b@order.summit')::text, true);
set local role authenticated;

select results_eq(
  $$ select email from summit.list_owners() where email like '%@order.summit' $$,
  $$ values ('middle-b@order.summit'), ('first-a@order.summit'), ('last-c@order.summit') $$,
  'the caller comes first, then the others by owner since');
select is(
  (select email from summit.list_owners() limit 1), 'middle-b@order.summit',
  'the caller heads the whole list');

select * from finish();
rollback;

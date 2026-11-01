-- 623 Summit: a guest's change to a confirmed stay (20261031000200_summit_changed_stays.sql;
-- 623Summit repo, docs/edited-stay-plan.md): the confirmed nights the database keeps, the hold on
-- them while a change waits, the hold timer putting a stay back, and the change_kept email.
begin;
select plan(24);

delete from summit.email_jobs;
update summit.email_settings set is_live = false, worker_url = null, reply_to = null, owner_alert_to = null;

-- Stays sit thousands of days out so they never meet a local booking's dates.
create function pg_temp.id(p_n integer)
returns uuid
language sql
immutable
as $$
  select ('f3100000-0000-0000-0000-' || lpad(p_n::text, 12, '0'))::uuid;
$$;

create function pg_temp.book(p_n integer, p_days integer, p_nights integer, p_status text)
returns void
language sql
as $$
  insert into summit.bookings (id, check_in, check_out, guests, occasion, name, email, phone, status, hold_expires_at)
  values (pg_temp.id(p_n), current_date + p_days, current_date + p_days + p_nights, 2, 'Other', 'Test Guest',
          'changed-stay-' || p_n || '@test.cwr', '5550001111', p_status,
          case when p_status = 'pending' then now() + interval '48 hours' end);
$$;

-- A guest's move of a confirmed stay, as manage-booking writes it.
create function pg_temp.move(p_n integer, p_days integer, p_nights integer)
returns void
language sql
as $$
  update summit.bookings
     set check_in = current_date + p_days, check_out = current_date + p_days + p_nights,
         status = 'pending', decided_at = null, hold_expires_at = now() + interval '48 hours',
         change_note = 'Moved from somewhere.'
   where id = pg_temp.id(p_n);
$$;

create function pg_temp.jobs(p_n integer)
returns text[]
language sql
as $$
  select coalesce(array_agg(kind::text || ':' || event order by 1), '{}')
  from summit.email_jobs where booking_id = pg_temp.id(p_n);
$$;

-- ---------------------------------------------------------------------------
-- Columns and the confirmed nights the database keeps
-- ---------------------------------------------------------------------------

select has_column('summit', 'bookings', 'confirmed_check_in', 'bookings has confirmed_check_in');
select has_column('summit', 'bookings', 'change_note', 'bookings has change_note');

select pg_temp.book(1, 5000, 4, 'confirmed');
select is((select confirmed_check_in from summit.bookings where id = pg_temp.id(1)), current_date + 5000,
  'a confirmed stay records its first night');
select is((select confirmed_check_out from summit.bookings where id = pg_temp.id(1)), current_date + 5004,
  'a confirmed stay records its last night');

select pg_temp.book(2, 5100, 4, 'pending');
select is((select confirmed_check_in from summit.bookings where id = pg_temp.id(2)), null::date,
  'a fresh request has no confirmed nights');

select pg_temp.move(1, 5010, 4);
select is((select confirmed_check_in from summit.bookings where id = pg_temp.id(1)), current_date + 5000,
  'a moved stay keeps the nights that were confirmed while it waits');

update summit.bookings set check_in = current_date + 5001, check_out = current_date + 5004, status = 'confirmed'
 where id = pg_temp.id(1);
select is((select confirmed_check_in from summit.bookings where id = pg_temp.id(1)), current_date + 5001,
  'confirming again records the new nights');

select throws_ok(
  $$ update summit.bookings set confirmed_check_in = current_date where id = pg_temp.id(2) $$,
  '23514', null, 'confirmed nights come in pairs');
select throws_ok(
  $$ update summit.bookings set change_note = repeat('x', 501) where id = pg_temp.id(1) $$,
  '23514', null, 'a change note is at most 500 characters');

-- ---------------------------------------------------------------------------
-- The confirmed nights stay held while a change waits
-- ---------------------------------------------------------------------------

select pg_temp.book(3, 5200, 4, 'confirmed');
select pg_temp.move(3, 5210, 4);
select ok(not summit.is_range_available(current_date + 5201, current_date + 5204),
  'nobody else can take the nights a changed stay was confirmed for');
select ok(summit.is_range_available(current_date + 5201, current_date + 5204, pg_temp.id(3)),
  'the changed stay itself may move back onto them');
select ok(exists (
  select 1 from summit.get_unavailable_ranges(current_date + 5190, current_date + 5230)
   where starts_on = current_date + 5200 and ends_on = current_date + 5204 and kind = 'held'),
  'the calendar shows those nights as held');

update summit.bookings set hold_expires_at = now() - interval '1 minute' where id = pg_temp.id(3);
select ok(summit.is_range_available(current_date + 5201, current_date + 5204),
  'once the hold has run out the nights are no longer held');

-- ---------------------------------------------------------------------------
-- The hold timer puts a changed stay back; a fresh request still expires
-- ---------------------------------------------------------------------------

select is(summit.format_house_date('2026-11-04'), '4 November 2026', 'dates are written the way the console writes them');

update summit.bookings set hold_expires_at = now() - interval '1 minute' where id = pg_temp.id(2);
select pg_temp.book(4, 5300, 4, 'confirmed');
select pg_temp.move(4, 5310, 4);
select pg_temp.book(5, 5302, 3, 'pending');
update summit.bookings set hold_expires_at = now() - interval '1 minute' where id in (pg_temp.id(4));
-- Someone else is confirmed on stay 4's old nights while its change waits.
update summit.bookings set status = 'confirmed', hold_expires_at = null where id = pg_temp.id(5);
select pg_temp.book(6, 5400, 4, 'confirmed');
select pg_temp.move(6, 5410, 5);
update summit.bookings set hold_expires_at = now() - interval '1 minute' where id = pg_temp.id(6);
-- Stay 3 is already stale from above.

select ok(summit.expire_stale_holds() >= 4, 'the timer touches every stale hold');
select is((select status from summit.bookings where id = pg_temp.id(3)), 'confirmed',
  'a changed stay whose hold ran out is confirmed again');
select is((select check_in from summit.bookings where id = pg_temp.id(3)), current_date + 5200,
  '... on the nights it was confirmed for');
select ok((select change_note from summit.bookings where id = pg_temp.id(3))
  like 'Asked to move to % → %. Not confirmed in time, so the original dates were kept.',
  '... with a note saying what happened');
select is((select status from summit.bookings where id = pg_temp.id(4)), 'expired',
  'a changed stay whose old nights were confirmed for someone else expires as before');
select is((select confirmed_check_in from summit.bookings where id = pg_temp.id(4)), null::date,
  '... and its lost nights are no longer held or offered back');
select is((select status from summit.bookings where id = pg_temp.id(2)), 'expired',
  'a fresh request still expires');

-- ---------------------------------------------------------------------------
-- Email: "your original dates stand", and no owner alert for it
-- ---------------------------------------------------------------------------

delete from summit.email_jobs;
update summit.email_settings set is_live = true, owner_alert_to = array['summit-owner@test.cwr']::extensions.citext[];

select pg_temp.book(7, 5500, 4, 'confirmed');
select pg_temp.move(7, 5510, 4);
delete from summit.email_jobs;
update summit.bookings
   set check_in = current_date + 5500, check_out = current_date + 5504, status = 'confirmed',
       hold_expires_at = null, decided_at = now(),
       change_note = 'Asked to move to somewhere. You kept the original dates.'
 where id = pg_temp.id(7);
select is(pg_temp.jobs(7), array['guest:change_kept'],
  'keeping the original dates tells the guest and does not alert the owner');

select pg_temp.book(8, 5600, 4, 'confirmed');
delete from summit.email_jobs;
update summit.bookings set check_out = current_date + 5603, change_note = 'Shortened from somewhere. Still confirmed.'
 where id = pg_temp.id(8);
select is(pg_temp.jobs(8), array['guest:dates_changed', 'owner_alert:dates_changed'],
  'a guest shortening a stay is a date change the owner hears about');

select pg_temp.book(9, 5700, 4, 'confirmed');
select pg_temp.move(9, 5710, 4);
delete from summit.email_jobs;
update summit.bookings
   set check_in = current_date + 5700, check_out = current_date + 5704, status = 'confirmed',
       hold_expires_at = null, change_note = 'Back on the confirmed dates. Still confirmed.'
 where id = pg_temp.id(9);
select is(pg_temp.jobs(9), array['guest:dates_changed', 'owner_alert:dates_changed'],
  'a guest moving back onto the confirmed nights is not mistaken for the owner keeping them');

select * from finish();
rollback;

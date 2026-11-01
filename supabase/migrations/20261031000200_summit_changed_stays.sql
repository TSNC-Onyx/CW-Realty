-- 623 Summit: a guest's change to a confirmed stay (623Summit repo, docs/edited-stay-plan.md,
-- owner approved 2026-10-31). Applied after 20261031000100_summit_email_outbox.sql.
--
-- The rule: when every night of a guest's new dates was already confirmed, the stay stays
-- confirmed (manage-booking writes that); any other change goes back to the owner as a request,
-- and the nights that were confirmed stay held for the guest until the owner decides. "Can't do
-- these dates" in the console, or a hold that runs out, puts the stay back on those nights.
--
-- Expand-only: bookings gains confirmed_check_in/out and change_note; three schema functions and
-- two email functions are replaced with the same signatures and rights. Rollback is at the end.

-- ---------------------------------------------------------------------------
-- The nights last confirmed, kept by the database itself, and the note the console shows.
-- ---------------------------------------------------------------------------

alter table summit.bookings
  add column confirmed_check_in date,
  add column confirmed_check_out date,
  add column change_note text,
  add constraint bookings_confirmed_nights_pair check (
    (confirmed_check_in is null) = (confirmed_check_out is null)
    and (confirmed_check_in is null or confirmed_check_out > confirmed_check_in)
  ),
  add constraint bookings_change_note_length check (change_note is null or char_length(change_note) <= 500);

comment on column summit.bookings.confirmed_check_in is
  'First night last confirmed. Set by bookings_track_confirmed_nights whenever the row is confirmed; kept while a guest''s change waits as pending.';
comment on column summit.bookings.change_note is
  'What the guest (or "Can''t do these dates", or the hold timer) changed, in words. Display only; written by manage-booking, the console and expire_stale_holds.';

create function summit.track_confirmed_nights()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'confirmed' then
    new.confirmed_check_in := new.check_in;
    new.confirmed_check_out := new.check_out;
  end if;
  return new;
end;
$$;

create trigger bookings_track_confirmed_nights
  before insert or update on summit.bookings
  for each row execute function summit.track_confirmed_nights();

update summit.bookings
   set confirmed_check_in = check_in, confirmed_check_out = check_out
 where status = 'confirmed';

-- "4 November 2026", the way the console and guest page write a date (api.js formatDate).
create function summit.format_house_date(p_date date)
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(p_date, 'FMDD FMMonth YYYY');
$$;

-- ---------------------------------------------------------------------------
-- A changed stay's confirmed nights stay held while its hold is live.
-- ---------------------------------------------------------------------------

create or replace function summit.is_range_available(p_check_in date, p_check_out date, p_ignore_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = summit, pg_temp
as $$
    select not exists (
        select 1 from summit.bookings b
         where b.id is distinct from p_ignore_id
           and (b.status = 'confirmed'
                or (b.status = 'pending' and b.hold_expires_at > now()))
           and daterange(b.check_in, b.check_out, '[)')
               && daterange(p_check_in, p_check_out, '[)')
        union all
        select 1 from summit.bookings b
         where b.id is distinct from p_ignore_id
           and b.status = 'pending'
           and b.hold_expires_at > now()
           and b.confirmed_check_in is not null
           and daterange(b.confirmed_check_in, b.confirmed_check_out, '[)')
               && daterange(p_check_in, p_check_out, '[)')
        union all
        select 1 from summit.blackouts k
         where daterange(k.starts_on, k.ends_on, '[)')
               && daterange(p_check_in, p_check_out, '[)')
    );
$$;

comment on function summit.is_range_available(date, date, uuid) is
  'False when the range collides with a confirmed stay, a live hold (including the confirmed nights a changed stay keeps while it waits), or a blackout. p_ignore_id lets a booking be re-checked without colliding with itself.';

create or replace function summit.get_unavailable_ranges(p_from date, p_to date)
returns table (starts_on date, ends_on date, kind text)
language sql
stable
security definer
set search_path = summit, pg_temp
as $$
    with window_range as (
        select daterange(p_from, least(p_to, p_from + 400), '[)') as r
    )
    select b.check_in, b.check_out, 'booked'::text
      from summit.bookings b, window_range w
     where b.status = 'confirmed'
       and daterange(b.check_in, b.check_out, '[)') && w.r
    union all
    select b.check_in, b.check_out, 'held'::text
      from summit.bookings b, window_range w
     where b.status = 'pending'
       and b.hold_expires_at > now()
       and daterange(b.check_in, b.check_out, '[)') && w.r
    union all
    select b.confirmed_check_in, b.confirmed_check_out, 'held'::text
      from summit.bookings b, window_range w
     where b.status = 'pending'
       and b.hold_expires_at > now()
       and b.confirmed_check_in is not null
       and daterange(b.confirmed_check_in, b.confirmed_check_out, '[)') && w.r
    union all
    select k.starts_on, k.ends_on, 'unavailable'::text
      from summit.blackouts k, window_range w
     where daterange(k.starts_on, k.ends_on, '[)') && w.r;
$$;

-- ---------------------------------------------------------------------------
-- A changed stay whose hold runs out goes back to its confirmed nights instead of expiring.
-- ---------------------------------------------------------------------------

create or replace function summit.expire_stale_holds()
returns integer
language plpgsql
security definer
set search_path = summit, pg_temp
as $$
declare
    touched integer := 0;
    expired_count integer;
    stay record;
begin
    for stay in
        select id, check_in, check_out, confirmed_check_in, confirmed_check_out
          from summit.bookings
         where status = 'pending'
           and hold_expires_at is not null
           and hold_expires_at < now()
           and confirmed_check_in is not null
           for update skip locked
    loop
        begin
            update summit.bookings
               set check_in = stay.confirmed_check_in,
                   check_out = stay.confirmed_check_out,
                   status = 'confirmed',
                   hold_expires_at = null,
                   decided_at = now(),
                   change_note = 'Asked to move to ' || summit.format_house_date(stay.check_in) || ' → '
                     || summit.format_house_date(stay.check_out)
                     || '. Not confirmed in time, so the original dates were kept.'
             where id = stay.id;
        exception when exclusion_violation then
            -- Someone else was confirmed on those nights while the change waited. The nights are
            -- gone, so they are no longer held or offered back if the owner reopens the request.
            update summit.bookings
               set status = 'expired', confirmed_check_in = null, confirmed_check_out = null
             where id = stay.id;
        end;
        touched := touched + 1;
    end loop;

    -- A changed stay skipped above because it was locked waits for the next run; it is never expired here.
    update summit.bookings
       set status = 'expired'
     where status = 'pending'
       and hold_expires_at is not null
       and hold_expires_at < now()
       and confirmed_check_in is null;
    get diagnostics expired_count = row_count;
    return touched + expired_count;
end;
$$;

comment on function summit.expire_stale_holds() is
  'Moves pending requests past their hold window to expired, releasing the dates. A guest''s change to a confirmed stay is put back on its confirmed nights instead, unless another stay was confirmed on them.';

-- ---------------------------------------------------------------------------
-- Email: "your original dates stand", and no owner alert for what the owner (or the timer) did.
-- ---------------------------------------------------------------------------

alter table summit.email_jobs drop constraint email_jobs_event_check;
alter table summit.email_jobs add constraint email_jobs_event_check check (event in (
  'received', 'confirmed', 'dates_changed', 'declined', 'cancelled', 'expired',
  'address_fixed', 'fresh_link', 'link_requested', 'change_kept'
));

create or replace function summit.get_booking_email_event(p_old summit.bookings, p_new summit.bookings)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_old.id is null and p_new.status = 'confirmed' then 'confirmed'
    when p_old.id is null then 'received'
    when lower(p_new.email::text) <> lower(p_old.email::text) then 'address_fixed'
    when p_new.manage_token <> p_old.manage_token then 'fresh_link'
    when p_old.status = 'pending' and p_new.status = 'confirmed'
      and p_new.check_in = p_old.confirmed_check_in and p_new.check_out = p_old.confirmed_check_out
      and p_new.change_note like 'Asked to move to %' then 'change_kept'
    when p_new.check_in <> p_old.check_in or p_new.check_out <> p_old.check_out then 'dates_changed'
    when p_old.status <> p_new.status and p_new.status in ('confirmed', 'declined', 'cancelled', 'expired') then p_new.status
    when p_old.status <> 'pending' and p_new.status = 'pending' then 'received'
  end;
$$;

create or replace function summit.queue_booking_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event text;
begin
  if not summit.email_is_live() then
    return null;
  end if;
  v_event := summit.get_booking_email_event(old, new);
  if v_event is not null and summit.is_guest_email_allowed(new.email_guest, new.source, new.email::text) then
    perform summit.queue_guest_email(new.id, v_event);
  end if;
  if v_event = 'address_fixed' and summit.is_guest_email_allowed(old.email_guest, old.source, old.email::text) then
    insert into summit.email_jobs (kind, booking_id, event, recipient_email) values ('guest_notice', new.id, v_event, old.email);
  end if;
  -- change_kept is the owner's (or the hold timer's) doing, never news to the owner.
  if v_event is not null and v_event <> 'change_kept' and summit.is_owner_alert_due(old, new)
     and cardinality((select owner_alert_to from summit.email_settings where id)) > 0 then
    insert into summit.email_jobs (kind, booking_id, event) values ('owner_alert', new.id, v_event);
  end if;
  return null;
end;
$$;

revoke all on function summit.track_confirmed_nights(), summit.format_house_date(date) from public;

-- ---------------------------------------------------------------------------
-- Rollback (by hand, owner-approved): re-run the bodies of is_range_available,
-- get_unavailable_ranges and expire_stale_holds from 20261023000100_summit_schema.sql and of
-- get_booking_email_event and queue_booking_email from 20261031000100_summit_email_outbox.sql;
-- restore email_jobs_event_check without 'change_kept' (after deleting such jobs); then
--   drop trigger bookings_track_confirmed_nights on summit.bookings;
--   drop function summit.track_confirmed_nights(), summit.format_house_date(date);
--   alter table summit.bookings drop column confirmed_check_in, drop column confirmed_check_out,
--     drop column change_note;
-- ---------------------------------------------------------------------------

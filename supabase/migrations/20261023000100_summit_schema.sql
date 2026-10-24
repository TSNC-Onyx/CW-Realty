-- 623 Summit's database, moved here from its own Supabase project (owner request 2026-10-22;
-- docs/runbooks/summit-shared-database.md). 623 Summit is a separate site with its own owner list:
-- nothing in cwr references summit, and summit references nothing in cwr.
--
-- Built from 623's eleven migrations (623Summit repo, supabase/migrations) replayed in the order
-- the old project applied them, then checked object by object against that project.
-- Two deliberate differences:
--   - No rls_auto_enable event trigger: it would fire on every create table in this project.
--     Each table below turns row level security on itself.
--   - Table rights are only the ones 623's migrations grant. The old project's public schema also
--     handed every table to anon through Supabase's default privileges; row level security was
--     the only thing in the way. Here anon gets no table rights at all.

create extension if not exists citext with schema extensions;
create extension if not exists btree_gist with schema extensions;

create schema summit;
grant usage on schema summit to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table summit.admins (
  email extensions.citext primary key,
  created_at timestamptz not null default now(),
  label text
);

comment on table summit.admins is
  'Email addresses allowed into the 623 owner console. Owners are added from the console''s invite form.';

create table summit.blackouts (
  id uuid primary key default extensions.gen_random_uuid(),
  created_at timestamptz not null default now(),
  starts_on date not null,
  ends_on date not null,
  reason text not null,
  created_by text,
  constraint blackouts_dates_ordered check (ends_on > starts_on),
  constraint blackouts_reason_length check (char_length(reason) between 1 and 200)
);

comment on table summit.blackouts is
  'Dates the owner has taken off the market. Treated exactly like a confirmed booking.';

create table summit.inquiries (
  id uuid primary key default extensions.gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email extensions.citext not null,
  phone text,
  topic text not null,
  message text not null,
  status text not null default 'new',
  source_ip inet,
  user_agent text,
  constraint inquiries_email_format check (email operator(extensions.~*) '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::extensions.citext),
  constraint inquiries_message_length check (char_length(message) between 1 and 5000),
  constraint inquiries_name_length check (char_length(name) between 1 and 200),
  constraint inquiries_phone_length check (phone is null or char_length(phone) between 7 and 32),
  constraint inquiries_status_allowed check (status in ('new', 'contacted', 'archived')),
  constraint inquiries_topic_allowed check (topic in ('General inquiry', 'Extended stay', 'Private event', 'Production or press')),
  constraint inquiries_ua_length check (user_agent is null or char_length(user_agent) <= 500)
);

comment on table summit.inquiries is
  'Submissions from the site contact form. Written only by the submit-form Edge Function (service_role).';

create table summit.lookup_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  source_ip inet,
  outcome text not null,
  constraint lookup_events_outcome_allowed check (outcome in ('found', 'not_found'))
);

comment on table summit.lookup_events is
  'One row per manage-link lookup. Used for throttling; IPs are purged after 30 days.';

-- generate_booking_reference is a column default of bookings, so it comes before the table.
create function summit.generate_booking_reference()
returns text
language sql
set search_path = pg_catalog, pg_temp
as $$
    select 'SUM-' || string_agg(
        substr('ACDEFGHJKLMNPQRTUVWXY34679', 1 + floor(random() * 25)::int, 1), '')
      from generate_series(1, 5);
$$;

comment on function summit.generate_booking_reference() is
  'Five characters from an alphabet with no 0/O/1/I/S/5/B/8/2/Z, so a code read over the phone cannot be written down wrong.';

create table summit.bookings (
  id uuid primary key default extensions.gen_random_uuid(),
  created_at timestamptz not null default now(),
  check_in date not null,
  check_out date not null,
  guests smallint not null,
  occasion text not null,
  name text not null,
  email extensions.citext not null,
  phone text not null,
  notes text,
  status text not null default 'pending',
  source_ip inet,
  user_agent text,
  reference text not null default summit.generate_booking_reference(),
  manage_token text not null default encode(extensions.gen_random_bytes(18), 'hex'),
  hold_expires_at timestamptz,
  decided_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by text,
  owner_note text,
  guest_message text,
  source text not null default 'website',
  total_amount numeric(10, 2),
  constraint bookings_manage_token_key unique (manage_token),
  constraint bookings_reference_key unique (reference),
  constraint bookings_no_confirmed_overlap
    exclude using gist (daterange(check_in, check_out, '[)') with &&) where (status = 'confirmed'),
  constraint bookings_cancelled_by_allowed check (cancelled_by is null or cancelled_by in ('guest', 'owner')),
  constraint bookings_dates_ordered check (check_out > check_in),
  constraint bookings_email_format check (email operator(extensions.~*) '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::extensions.citext),
  constraint bookings_guest_count check (guests between 1 and 10),
  constraint bookings_guest_message_length check (guest_message is null or char_length(guest_message) <= 2000),
  constraint bookings_min_three_nights check ((check_out - check_in) >= 3),
  constraint bookings_name_length check (char_length(name) between 1 and 200),
  constraint bookings_notes_length check (notes is null or char_length(notes) <= 5000),
  constraint bookings_occasion_allowed check (occasion in ('Family stay', 'Anniversary', 'Corporate retreat', 'Wedding party', 'Other')),
  constraint bookings_owner_note_length check (owner_note is null or char_length(owner_note) <= 2000),
  constraint bookings_phone_length check (char_length(phone) between 7 and 32),
  constraint bookings_source_allowed check (source in ('website', 'owner')),
  constraint bookings_status_allowed check (status in ('pending', 'confirmed', 'declined', 'cancelled', 'expired', 'archived')),
  constraint bookings_total_amount_range check (total_amount is null or (total_amount >= 0 and total_amount <= 1000000)),
  constraint bookings_ua_length check (user_agent is null or char_length(user_agent) <= 500)
);

comment on table summit.bookings is
  'Reservation requests from the site book form. Three-night minimum matches the client-side rule.';

create table summit.booking_payments (
  id uuid primary key default extensions.gen_random_uuid(),
  booking_id uuid not null references summit.bookings (id) on delete cascade,
  kind text not null default 'payment',
  amount numeric(10, 2) not null,
  received_on date not null default current_date,
  method text not null,
  note text,
  created_at timestamptz not null default now(),
  created_by text,
  constraint booking_payments_amount_range check (amount > 0 and amount <= 1000000),
  constraint booking_payments_kind_allowed check (kind in ('payment', 'refund')),
  constraint booking_payments_method_allowed check (method in ('Card', 'Bank transfer', 'Check', 'Cash', 'Other')),
  constraint booking_payments_note_length check (note is null or char_length(note) <= 500)
);

comment on table summit.booking_payments is
  'Money received for (or refunded on) a booking. Owner-only. The balance is bookings.total_amount minus payments plus refunds, worked out in admin.js.';

create index blackouts_range_idx on summit.blackouts (starts_on, ends_on);
create index booking_payments_booking_idx on summit.booking_payments (booking_id);
create index bookings_check_in_idx on summit.bookings (check_in);
create index bookings_created_at_idx on summit.bookings (created_at desc);
create index bookings_email_idx on summit.bookings (email);
create index bookings_hold_idx on summit.bookings (hold_expires_at) where (status = 'pending');
create index bookings_manage_token_idx on summit.bookings (manage_token);
create index bookings_reference_idx on summit.bookings (reference);
create index bookings_source_ip_created_at_idx on summit.bookings (source_ip, created_at desc) where (source_ip is not null);
create index bookings_status_idx on summit.bookings (status);
create index inquiries_created_at_idx on summit.inquiries (created_at desc);
create index inquiries_email_idx on summit.inquiries (email);
create index inquiries_source_ip_created_at_idx on summit.inquiries (source_ip, created_at desc) where (source_ip is not null);
create index inquiries_status_idx on summit.inquiries (status);
create index lookup_events_ip_time_idx on summit.lookup_events (source_ip, created_at desc) where (source_ip is not null);

-- ---------------------------------------------------------------------------
-- Functions (bodies unchanged from 623 apart from the schema name)
-- ---------------------------------------------------------------------------

create function summit.is_admin()
returns boolean
language sql
stable
security definer
set search_path = summit, pg_temp
as $$
    select exists (
        select 1 from summit.admins
         where email = ((auth.jwt() ->> 'email'))::extensions.citext
    );
$$;

comment on function summit.is_admin() is
  'True when the signed-in email is in summit.admins. Deliberately callable by authenticated: the console uses it to explain a non-owner sign-in. Tells the caller nothing about anyone else. Flagged by linter 0029 by design.';

create function summit.is_range_available(p_check_in date, p_check_out date, p_ignore_id uuid default null)
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
        select 1 from summit.blackouts k
         where daterange(k.starts_on, k.ends_on, '[)')
               && daterange(p_check_in, p_check_out, '[)')
    );
$$;

comment on function summit.is_range_available(date, date, uuid) is
  'False when the range collides with a confirmed stay, a live hold, or a blackout. p_ignore_id lets a booking be re-checked without colliding with itself.';

create function summit.get_unavailable_ranges(p_from date, p_to date)
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
    select k.starts_on, k.ends_on, 'unavailable'::text
      from summit.blackouts k, window_range w
     where daterange(k.starts_on, k.ends_on, '[)') && w.r;
$$;

comment on function summit.get_unavailable_ranges(date, date) is
  'Blocked date ranges for the public calendar. Deliberately callable by anon: the booking form needs it. Dates only, never guest details, window capped at 400 days. Flagged by linter 0028 by design.';

create function summit.expire_stale_holds()
returns integer
language plpgsql
security definer
set search_path = summit, pg_temp
as $$
declare
    touched integer;
begin
    update summit.bookings
       set status = 'expired'
     where status = 'pending'
       and hold_expires_at is not null
       and hold_expires_at < now();
    get diagnostics touched = row_count;
    return touched;
end;
$$;

comment on function summit.expire_stale_holds() is
  'Moves pending requests past their hold window to expired, releasing the dates. Availability already ignores stale holds; this keeps the admin list honest.';

create function summit.purge_old_technical_data()
returns void
language sql
security definer
set search_path = summit, pg_temp
as $$
    update summit.inquiries set source_ip = null, user_agent = null
     where created_at < now() - interval '90 days'
       and (source_ip is not null or user_agent is not null);
    update summit.bookings set source_ip = null, user_agent = null
     where created_at < now() - interval '90 days'
       and (source_ip is not null or user_agent is not null);
    delete from summit.lookup_events where created_at < now() - interval '30 days';
$$;

comment on function summit.purge_old_technical_data() is
  'Nulls source_ip and user_agent after 90 days, matching the retention promise in privacy.html. Scheduled daily via pg_cron.';

create function summit.recent_submission_count(p_ip inet, p_window interval)
returns integer
language sql
stable
security definer
set search_path = summit, pg_temp
as $$
    select
        (select count(*) from summit.inquiries
          where source_ip = p_ip and created_at > now() - p_window)
      + (select count(*) from summit.bookings
          where source_ip = p_ip and created_at > now() - p_window);
$$;

comment on function summit.recent_submission_count(inet, interval) is
  'Submissions from one IP inside a window, across both tables. Called by the submit-form Edge Function before inserting. security definer because the tables are invisible to every role except service_role.';

create function summit.recent_lookup_count(p_ip inet, p_window interval)
returns integer
language sql
stable
security definer
set search_path = summit, pg_temp
as $$
    select count(*)::integer from summit.lookup_events
     where source_ip = p_ip and created_at > now() - p_window;
$$;

create function summit.record_lookup(p_ip inet, p_outcome text)
returns void
language sql
security definer
set search_path = summit, pg_temp
as $$
    insert into summit.lookup_events (source_ip, outcome) values (p_ip, p_outcome);
$$;

-- ---------------------------------------------------------------------------
-- Row level security: owners (summit.admins) only. Guests reach their booking
-- through the manage-booking Edge Function, never through these tables.
-- ---------------------------------------------------------------------------

alter table summit.admins enable row level security;
alter table summit.blackouts enable row level security;
alter table summit.booking_payments enable row level security;
alter table summit.bookings enable row level security;
alter table summit.inquiries enable row level security;
alter table summit.lookup_events enable row level security;

create policy admins_admin_read on summit.admins
  for select to authenticated using (summit.is_admin());
create policy blackouts_admin_all on summit.blackouts
  for all to authenticated using (summit.is_admin()) with check (summit.is_admin());
create policy booking_payments_admin_all on summit.booking_payments
  for all to authenticated using (summit.is_admin()) with check (summit.is_admin());
create policy bookings_admin_all on summit.bookings
  for all to authenticated using (summit.is_admin()) with check (summit.is_admin());
create policy inquiries_admin_all on summit.inquiries
  for all to authenticated using (summit.is_admin()) with check (summit.is_admin());
create policy lookup_events_admin_read on summit.lookup_events
  for select to authenticated using (summit.is_admin());

-- ---------------------------------------------------------------------------
-- Rights, exactly as 623's migrations grant them
-- ---------------------------------------------------------------------------

grant select on summit.admins to authenticated;
grant select, insert, update on summit.admins to service_role;
grant select, insert, update, delete on summit.blackouts to authenticated, service_role;
grant select, insert, delete on summit.booking_payments to authenticated;
grant select, insert, update, delete on summit.booking_payments to service_role;
grant select, insert, update, delete on summit.bookings to authenticated;
grant select, insert, update on summit.bookings to service_role;
grant select, insert, update, delete on summit.inquiries to authenticated;
grant select, insert, update on summit.inquiries to service_role;
grant select on summit.lookup_events to authenticated;
grant select, insert, delete on summit.lookup_events to service_role;
grant usage on sequence summit.lookup_events_id_seq to service_role;

revoke all on function summit.generate_booking_reference() from public;
revoke all on function summit.is_admin() from public;
revoke all on function summit.is_range_available(date, date, uuid) from public;
revoke all on function summit.get_unavailable_ranges(date, date) from public;
revoke all on function summit.expire_stale_holds() from public;
revoke all on function summit.purge_old_technical_data() from public;
revoke all on function summit.recent_submission_count(inet, interval) from public;
revoke all on function summit.recent_lookup_count(inet, interval) from public;
revoke all on function summit.record_lookup(inet, text) from public;

grant execute on function summit.generate_booking_reference() to authenticated, service_role;
grant execute on function summit.is_admin() to authenticated, service_role;
grant execute on function summit.is_range_available(date, date, uuid) to service_role;
grant execute on function summit.get_unavailable_ranges(date, date) to anon, authenticated, service_role;
grant execute on function summit.expire_stale_holds() to service_role;
grant execute on function summit.purge_old_technical_data() to service_role;
grant execute on function summit.recent_submission_count(inet, interval) to service_role;
grant execute on function summit.recent_lookup_count(inet, interval) to service_role;
grant execute on function summit.record_lookup(inet, text) to service_role;

-- ---------------------------------------------------------------------------
-- Scheduled jobs. The summit_ prefix keeps them out of cwr.check_scheduled_job_runs,
-- which watches only cwr_ jobs.
-- ---------------------------------------------------------------------------

select cron.schedule('summit_purge_old_technical_data', '17 4 * * *', 'select summit.purge_old_technical_data()');
select cron.schedule('summit_expire_stale_holds', '*/15 * * * *', 'select summit.expire_stale_holds()');

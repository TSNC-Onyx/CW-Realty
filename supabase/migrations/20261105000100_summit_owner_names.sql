-- 623 Summit: owners' first and last names (623Summit repo, docs/owner-names-plan.md, owner approved
-- 2026-11-05). Applied after 20261101000100_summit_owner_list.sql.
--
-- A name lives on the shared login (auth.users.raw_user_meta_data: first_name, last_name), so one
-- name shows on both 623 Summit and Charlie Ward Realty. This migration only reads it. Names are
-- written through the Auth Admin API (auth.admin.updateUserById) by 623's Edge Functions and
-- Charlie Ward Realty's server actions, never by SQL: scripts/check-migrations.mjs forbids writing
-- the auth schema.
--
-- A name is a display label and never grants access. Anyone signed in can change their own
-- user_metadata through auth.updateUser, so nothing may ever decide access from it.
--
-- list_owners() gains two columns at the end. Its return type changes, so it is dropped and created
-- again in this one transaction, with its grant. Its sort is now written as expressions rather than
-- column positions. Rollback is at the end.

drop function summit.list_owners();

-- Every owner, the caller first. "Invited" means the invite has not been opened: opening it
-- confirms the address, and a login that never existed counts too. Anyone not on the list gets no
-- rows. A blank name part reads as none.
create function summit.list_owners()
returns table (
  email text,
  owner_since timestamptz,
  last_signed_in_at timestamptz,
  invite_sent_at timestamptz,
  is_invited boolean,
  gets_alerts boolean,
  is_you boolean,
  first_name text,
  last_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.email::text,
         a.created_at,
         u.last_sign_in_at,
         case when u.email_confirmed_at is null then u.confirmation_sent_at end,
         u.id is null or u.email_confirmed_at is null,
         exists (
           select 1 from summit.email_settings s, unnest(s.owner_alert_to) as alert(address)
           where s.id and lower(alert.address::text) = lower(a.email::text)
         ),
         lower(a.email::text) = lower(coalesce(auth.jwt() ->> 'email', '')),
         nullif(btrim(u.raw_user_meta_data ->> 'first_name'), ''),
         nullif(btrim(u.raw_user_meta_data ->> 'last_name'), '')
  from summit.admins a
  left join auth.users u on lower(u.email) = lower(a.email::text)
  where summit.is_admin()
  order by (lower(a.email::text) = lower(coalesce(auth.jwt() ->> 'email', ''))) desc, a.created_at;
$$;

revoke all on function summit.list_owners() from public, anon, authenticated;
grant execute on function summit.list_owners() to authenticated;

-- The login behind an owner on the list, with its name, for 623's server functions (service role
-- only). No row when the address is not an owner or has no login yet.
create function summit.get_owner_login(p_email text)
returns table (user_id uuid, first_name text, last_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id,
         nullif(btrim(u.raw_user_meta_data ->> 'first_name'), ''),
         nullif(btrim(u.raw_user_meta_data ->> 'last_name'), '')
  from summit.admins a
  join auth.users u on lower(u.email) = lower(a.email::text)
  where lower(a.email::text) = lower(p_email);
$$;

revoke all on function summit.get_owner_login(text) from public, anon, authenticated;
grant execute on function summit.get_owner_login(text) to service_role;

-- ---------------------------------------------------------------------------
-- Rollback, as a new forward migration (owner-approved):
--   drop function summit.get_owner_login(text);
--   drop function summit.list_owners();
--   -- then create list_owners() exactly as in 20261101000100, with its revoke and grant.
-- Names already written stay in user_metadata, where they are harmless and ignored.
-- ---------------------------------------------------------------------------

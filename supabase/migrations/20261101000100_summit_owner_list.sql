-- 623 Summit: the console's Owners tab (623Summit repo, docs/owners-tab-plan.md, owner approved
-- 2026-11-01). Applied after 20261031000200_summit_changed_stays.sql.
--
-- Owners see who else is an owner, choose who gets booking alerts (decision D4: the list is
-- email_settings.owner_alert_to, which the queue and the worker already read), and remove an
-- owner or cancel an unopened invite. Removing takes away 623 only: the row in summit.admins goes,
-- the login (shared with Charlie Ward Realty) is never touched.
--
-- Expand-only: three new functions, nothing altered. Rollback is at the end.

-- Every owner, the caller first. "Invited" means the invite has not been opened: opening it
-- confirms the address (checked on the local stack 2026-11-01), and a login that never existed
-- counts too. Anyone not on the list gets no rows.
create function summit.list_owners()
returns table (
  email text,
  owner_since timestamptz,
  last_signed_in_at timestamptz,
  invite_sent_at timestamptz,
  is_invited boolean,
  gets_alerts boolean,
  is_you boolean
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
         lower(a.email::text) = lower(coalesce(auth.jwt() ->> 'email', ''))
  from summit.admins a
  left join auth.users u on lower(u.email) = lower(a.email::text)
  where summit.is_admin()
  order by 7 desc, 2;
$$;

-- owner_alert_to without p_email, in its existing order. Callers lock the settings row in an
-- earlier statement, so the list read here is the latest one.
create function summit.get_alert_list_without(p_email text)
returns extensions.citext[]
language sql
stable
security definer
set search_path = ''
as $$
  select array(
    select alert.address
    from summit.email_settings s, unnest(s.owner_alert_to) with ordinality as alert(address, position)
    where s.id and lower(alert.address::text) <> lower(p_email)
    order by alert.position
  );
$$;

create function summit.set_owner_alerts(p_email text, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner extensions.citext;
begin
  -- Locks in remove_owner's order (owner row, then settings). A removal of the same person
  -- finishes first and this then finds no owner; two saves at once go one after the other, and
  -- the second reads the list the first wrote.
  select a.email into v_owner from summit.admins a where lower(a.email::text) = lower(p_email) for share;
  if not summit.is_admin() or v_owner is null then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  perform 1 from summit.email_settings where id for update;
  update summit.email_settings
     set owner_alert_to = summit.get_alert_list_without(p_email)
       || case when p_on then array[v_owner] else array[]::extensions.citext[] end
   where id;
  return true;
end;
$$;

create function summit.remove_owner(p_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  -- Every owner row is locked first, so two owners removing each other at once go one after the
  -- other, and the second finds it is no longer an owner. The house always keeps one.
  perform 1 from summit.admins for update;
  if not exists (select 1 from summit.admins a where lower(a.email::text) = v_caller) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if lower(p_email) = v_caller then
    raise exception 'cannot_remove_self' using errcode = 'P0001';
  end if;
  delete from summit.admins a where lower(a.email::text) = lower(p_email);
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform 1 from summit.email_settings where id for update;
  update summit.email_settings set owner_alert_to = summit.get_alert_list_without(p_email) where id;
  return true;
end;
$$;

revoke all on function
  summit.list_owners(), summit.get_alert_list_without(text),
  summit.set_owner_alerts(text, boolean), summit.remove_owner(text)
from public, anon, authenticated;
grant execute on function summit.list_owners(), summit.set_owner_alerts(text, boolean), summit.remove_owner(text)
to authenticated;

-- ---------------------------------------------------------------------------
-- Rollback (by hand, owner-approved):
--   drop function summit.list_owners(), summit.set_owner_alerts(text, boolean),
--     summit.remove_owner(text), summit.get_alert_list_without(text);
-- Owners removed meanwhile are re-invited from the console.
-- ---------------------------------------------------------------------------

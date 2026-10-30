-- Lock down the older property-management demo app left in the `public` schema of this shared
-- project (owner request 2026-10-30, "No, lock it down"; found by the 2026-10-29 visitor audit,
-- docs/visitor-audit-fixes-plan.md Phase 0). Its tables, views and functions granted every
-- privilege to anon and authenticated, so anyone holding the site's public key could read,
-- change or delete its rows and run its invoice and payment functions.
-- Neither site uses `public`: CW Realty reads and writes only cwr (and cwr_private), 623 Summit
-- only summit, and no function in those schemas refers to public.
-- Access-only: nothing is dropped or deleted. Extension-owned objects are skipped, and default
-- privileges for new objects are left as Supabase sets them. The owner roles keep access.
-- Rollback: docs/runbooks/legacy-public-schema-down.sql.

do $$
declare
  item record;
begin
  for item in
    select c.oid::regclass as name, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
  loop
    if item.relkind = 'S' then
      execute format('revoke all on sequence %s from anon, authenticated', item.name);
    else
      execute format('revoke all on table %s from anon, authenticated', item.name);
    end if;
  end loop;

  for item in
    select p.oid::regprocedure as name
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', item.name);
  end loop;
end
$$;

-- Undo supabase/migrations/20261029000100_lock_down_legacy_public_schema.sql: restores the
-- grants the older demo app in `public` had on 2026-10-30 (every privilege to anon and
-- authenticated on its tables, views and sequences; execute to everyone on its functions).
-- Only run this if that app must come back, and lock it down properly first.

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
      execute format('grant all on sequence %s to anon, authenticated', item.name);
    else
      execute format('grant all on table %s to anon, authenticated', item.name);
    end if;
  end loop;

  for item in
    select p.oid::regprocedure as name
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('grant execute on function %s to public, anon, authenticated', item.name);
  end loop;
end
$$;

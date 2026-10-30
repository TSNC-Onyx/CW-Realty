-- The older demo app in `public` is closed to visitors and signed-in users
-- (supabase/migrations/20261029000100_lock_down_legacy_public_schema.sql).
begin;
select plan(3);

select is(
  (select count(*)::integer
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
     and (has_table_privilege('anon', c.oid, 'select,insert,update,delete')
          or has_table_privilege('authenticated', c.oid, 'select,insert,update,delete'))),
  0,
  'Visitors and signed-in users cannot touch any table or view in public'
);

select is(
  (select count(*)::integer
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'S'
     and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
     and (has_sequence_privilege('anon', c.oid, 'usage,update')
          or has_sequence_privilege('authenticated', c.oid, 'usage,update'))),
  0,
  'Visitors and signed-in users cannot use any sequence in public'
);

select is(
  (select count(*)::integer
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'))),
  0,
  'Visitors and signed-in users cannot run any function in public'
);

select * from finish();
rollback;

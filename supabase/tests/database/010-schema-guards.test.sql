-- Schema-wide guarantees that must hold for every current and future cwr table.
begin;
select plan(8);

select is_empty(
  $$ select c.relname from pg_class c
     where c.relnamespace = 'cwr'::regnamespace and c.relkind = 'r' and not c.relrowsecurity $$,
  'Row Level Security is enabled on every cwr table'
);

select is_empty(
  $$ select c.relname from pg_class c
     where c.relnamespace = 'cwr'::regnamespace and c.relkind = 'r'
       and c.relname not in ('audit_log', 'idempotency_keys')
       and not exists (
         select 1 from pg_trigger t
         where t.tgrelid = c.oid and t.tgfoid = 'cwr.record_audit'::regproc
       ) $$,
  'Every cwr business table writes to the audit log'
);

select is_empty(
  $$ select p.proname from pg_proc p
     where p.pronamespace = 'cwr'::regnamespace
       and p.proname <> 'is_hidden_team_member'
       and has_function_privilege('anon', p.oid, 'execute') $$,
  'Visitors (anon) can run only the hidden-team-member check'
);

select is_empty(
  $$ select p.proname from pg_proc p
     where p.pronamespace = 'cwr'::regnamespace
       and p.prosecdef
       and not exists (
         select 1 from unnest(p.proconfig) c where c like 'search_path=%'
       ) $$,
  'Every SECURITY DEFINER function pins its search_path'
);

select ok(
  (select 'security_invoker=true' = any (reloptions) from pg_class where oid = 'cwr.trash'::regclass),
  'The trash view respects the viewer''s own access rules'
);

select is(
  (select count(*)::int from cwr.workflows w join cwr.tenants t on t.id = w.tenant_id where t.slug = 'cwr'),
  4,
  'The CWR tenant exists with its four workflows installed'
);

select set_eq(
  $$ select jobname from cron.job where jobname like 'cwr\_%' $$,
  array['cwr_purge_trash', 'cwr_purge_closed_conversations', 'cwr_purge_idempotency_keys', 'cwr_purge_audit_log'],
  'Retention jobs are scheduled'
);

select is_empty(
  $$ select 1 from pg_depend d
     join pg_class c on c.oid = d.objid
     where c.relnamespace = 'cwr'::regnamespace
       and d.refobjid in (select oid from pg_class where relnamespace = 'public'::regnamespace) $$,
  'No cwr object depends on the legacy public schema'
);

select * from finish();
rollback;

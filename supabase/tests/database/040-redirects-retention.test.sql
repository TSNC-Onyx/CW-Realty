-- Automatic redirects (navigation-reconciliation.md #6, #7), audit redaction,
-- and retention jobs (Infra §4).
begin;
select plan(12);
select cwr_test.create_fixture();

-- ---------------------------------------------------------------- redirects
select cwr_test.sign_in('manager');
set local role authenticated;

update cwr.listings set slug = '100-main-street-greensboro-nc' where id = cwr_test.id('live_listing');
select results_eq(
  $$ select target_path from cwr.redirects where source_path = '/listings/100-main-st-greensboro-nc' $$,
  array['/listings/100-main-street-greensboro-nc'],
  'Changing a slug redirects the old URL to the new one'
);

update cwr.listings set slug = '100-main-st-unit-a-greensboro-nc' where id = cwr_test.id('live_listing');
select set_eq(
  $$ select target_path from cwr.redirects where tenant_id = cwr_test.id('tenant_a') $$,
  array['/listings/100-main-st-unit-a-greensboro-nc'],
  'After a second change every old URL still reaches the page in one hop'
);

update cwr.listings set slug = '100-main-st-greensboro-nc' where id = cwr_test.id('live_listing');
select is_empty(
  $$ select 1 from cwr.redirects where source_path = '/listings/100-main-st-greensboro-nc' $$,
  'Changing a slug back removes the redirect that would hide the live page'
);

update cwr.listings set deleted_at = now() where id = cwr_test.id('draft_listing');
select results_eq(
  $$ select target_path, status_code::int from cwr.redirects where source_path = '/listings/200-oak-ave-greensboro-nc' $$,
  $$ values ('/listings', 301) $$,
  'A listing moved to trash permanently redirects to the listings page'
);
select is(
  (select count(*)::int from cwr.trash where id = cwr_test.id('draft_listing')), 1,
  'The removed listing appears in the trash'
);

update cwr.listings set deleted_at = null where id = cwr_test.id('draft_listing');
select is_empty(
  $$ select 1 from cwr.redirects where source_path = '/listings/200-oak-ave-greensboro-nc' $$,
  'Restoring a listing removes its redirect'
);

-- ---------------------------------------------------------------- audit privacy
reset role;
select is(
  (select new_values ? 'contact_email' from cwr.audit_log
   where record_id = cwr_test.id('staff_thread') and action = 'insert'),
  false,
  'Visitor contact details are kept out of the long-lived audit log'
);
select is(
  (select new_values ->> 'assignee_id' from cwr.audit_log
   where record_id = cwr_test.id('staff_thread') and action = 'insert'),
  cwr_test.id('staff')::text,
  'Non-personal thread changes are still audited'
);

-- ---------------------------------------------------------------- retention
update cwr.listings set deleted_at = now() - interval '31 days' where id = cwr_test.id('draft_listing');
insert into cwr.team_members (tenant_id, slug, full_name, deleted_at)
values (cwr_test.id('tenant_a'), 'recently-removed', 'Recently Removed', now() - interval '29 days');
select cwr.purge_trash();
select is_empty(
  $$ select 1 from cwr.listings where id = cwr_test.id('draft_listing') $$,
  'Trash older than 30 days is permanently removed'
);
select isnt_empty(
  $$ select 1 from cwr.team_members where slug = 'recently-removed' $$,
  'Trash younger than 30 days is kept'
);

insert into cwr.audit_log (tenant_id, actor_role, action, table_name, created_at)
values (cwr_test.id('tenant_a'), 'postgres', 'update', 'listings', now() - interval '3 years 1 day');
select cwr.purge_expired_audit_log();
select is_empty(
  $$ select 1 from cwr.audit_log where created_at < now() - interval '3 years' $$,
  'Audit entries older than 3 years are purged by the retention job'
);
select throws_ok(
  $$ delete from cwr.audit_log where tenant_id = cwr_test.id('tenant_a') $$,
  '42501', 'The audit log is append-only',
  'Outside the retention job, even the database owner cannot delete audit entries'
);

select * from finish();
rollback;

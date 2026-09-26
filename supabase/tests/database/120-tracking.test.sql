-- Tracking settings, lead attribution, and closed deals (Phase 6).
begin;
select plan(19);
select cwr_test.create_fixture();

insert into cwr.tracking_settings (tenant_id, gtm_container_id, meta_pixel_id, tags_reviewed_at)
values (cwr_test.id('tenant_a'), 'GTM-ABC1234', '1234567890123', null);

-- ---------------------------------------------------------------- tracking settings
select throws_ok(
  $$ update cwr.tracking_settings set gtm_container_id = 'not-an-id' where tenant_id = cwr_test.id('tenant_a') $$,
  '23514',
  null,
  'A Tag Manager ID must look like GTM-XXXXXXX'
);

select cwr_test.sign_out();
set local role anon;
select throws_ok(
  $$ insert into cwr.tracking_settings (tenant_id) values (cwr_test.id('tenant_b')) $$,
  '42501',
  null,
  'Visitors cannot add tracking settings'
);
select results_eq(
  $$ select gtm_container_id from cwr.tracking_settings where tenant_id = cwr_test.id('tenant_a') $$,
  $$ values ('GTM-ABC1234'::text) $$,
  'Visitors can read the tracking IDs'
);

reset role;
select cwr_test.sign_in('manager');
set local role authenticated;
update cwr.tracking_settings set gtm_container_id = 'GTM-EVIL999' where tenant_id = cwr_test.id('tenant_a');
select throws_ok(
  $$ insert into cwr.tracking_settings (tenant_id, gtm_container_id) values (cwr_test.id('tenant_a'), 'GTM-EVIL999') $$,
  '42501',
  null,
  'Managers cannot add tracking settings'
);
reset role;
select results_eq(
  $$ select gtm_container_id from cwr.tracking_settings where tenant_id = cwr_test.id('tenant_a') $$,
  $$ values ('GTM-ABC1234'::text) $$,
  'Managers cannot change the tracking IDs'
);

select cwr_test.sign_in('owner');
set local role authenticated;
update cwr.tracking_settings set gtm_container_id = 'GTM-NEW5678' where tenant_id = cwr_test.id('tenant_a');
reset role;
select results_eq(
  $$ select gtm_container_id from cwr.tracking_settings where tenant_id = cwr_test.id('tenant_a') $$,
  $$ values ('GTM-NEW5678'::text) $$,
  'Owners can change the tracking IDs'
);
select isnt_empty(
  $$ select 1 from cwr.audit_log where table_name = 'tracking_settings' and action = 'update' $$,
  'Changing the tracking IDs is logged'
);

-- ---------------------------------------------------------------- lead attribution
insert into cwr.lead_attribution (tenant_id, thread_id, gclid, gbraid, wbraid, fbc, fbp, utm_source, utm_medium, utm_campaign, utm_term, utm_content, landing_path)
values (cwr_test.id('tenant_a'), cwr_test.id('staff_thread'), 'Cj0KCQjwabc123', null, null, null, 'fb.1.1727222400000.1234567890', 'google', 'cpc', 'spring', null, null, '/listings');

select throws_ok(
  $$ insert into cwr.lead_attribution (tenant_id, thread_id, gclid, gbraid, wbraid, fbc, fbp, utm_source, utm_medium, utm_campaign, utm_term, utm_content, landing_path)
     values (cwr_test.id('tenant_a'), cwr_test.id('other_thread'), '<script>alert(1)</script>', null, null, null, null, null, null, null, null, null, null) $$,
  '23514',
  null,
  'A click ID with unexpected characters is refused'
);
select is(
  (select new_values ? 'gclid' from cwr.audit_log where table_name = 'lead_attribution' order by id desc limit 1),
  false,
  'Click IDs are left out of the audit log'
);

select cwr_test.sign_in('staff');
set local role authenticated;
select is_empty($$ select 1 from cwr.lead_attribution $$, 'Staff cannot read lead attribution');
select throws_ok(
  $$ insert into cwr.lead_attribution (tenant_id, thread_id) values (cwr_test.id('tenant_a'), cwr_test.id('other_thread')) $$,
  '42501',
  null,
  'Signed-in users cannot write lead attribution'
);
reset role;

select cwr_test.sign_in('manager');
set local role authenticated;
select isnt_empty($$ select 1 from cwr.lead_attribution $$, 'Managers read lead attribution');

-- ---------------------------------------------------------------- closed deals
select lives_ok(
  $$ insert into cwr.closed_deals (tenant_id, thread_id, closed_on, value_cents, recorded_by)
     values (cwr_test.id('tenant_a'), cwr_test.id('staff_thread'), date '2026-09-20', 35000000, cwr_test.id('manager')) $$,
  'Managers record a closed deal'
);
select throws_ok(
  $$ insert into cwr.closed_deals (tenant_id, thread_id, closed_on, value_cents, recorded_by)
     values (cwr_test.id('tenant_a'), cwr_test.id('staff_thread'), date '2026-09-21', null, cwr_test.id('manager')) $$,
  '23505',
  null,
  'A conversation has at most one closed deal'
);
update cwr.closed_deals set deleted_at = now() where thread_id = cwr_test.id('staff_thread');
select results_eq(
  $$ select item_type, label from cwr.trash where item_type = 'closed_deals' $$,
  $$ values ('closed_deals'::text, 'Closed deal: Visitor One'::text) $$,
  'A deleted closed deal shows in the trash with the contact''s name'
);
delete from cwr.closed_deals where thread_id = cwr_test.id('staff_thread');
reset role;
select isnt_empty($$ select 1 from cwr.closed_deals $$, 'Managers cannot delete a closed deal forever');

select cwr_test.sign_in('staff');
set local role authenticated;
select is_empty($$ select 1 from cwr.closed_deals $$, 'Staff cannot see closed deals');
reset role;

update cwr.closed_deals set deleted_at = now() - interval '31 days' where thread_id = cwr_test.id('staff_thread');
select cwr.purge_trash();
select is_empty($$ select 1 from cwr.closed_deals $$, 'The trash purge removes closed deals after 30 days');

delete from cwr.inbox_threads where id = cwr_test.id('staff_thread');
select is_empty($$ select 1 from cwr.lead_attribution where thread_id = cwr_test.id('staff_thread') $$, 'Attribution is removed with its conversation');

select * from finish();
rollback;

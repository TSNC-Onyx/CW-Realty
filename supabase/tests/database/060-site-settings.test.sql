-- Contact details the public site reads (Admin §4) and who may change them.
begin;
select plan(10);

select results_eq(
  $$ select s.phone, s.email, s.office_city, s.license_number
     from cwr.site_settings s join cwr.tenants t on t.id = s.tenant_id where t.slug = 'cwr' $$,
  $$ values ('+13367080560', 'charlie@charliewardrealty.com', 'Greensboro', 'C31457') $$,
  'The CWR tenant ships with its contact details'
);

select results_eq(
  $$ select s.is_connections_page_visible from cwr.site_settings s join cwr.tenants t on t.id = s.tenant_id where t.slug = 'cwr' $$,
  $$ values (true) $$,
  'The Connections page starts out showing (owner switch, 2026-10-09)'
);

select throws_ok(
  $$ update cwr.site_settings set office_postal_code = '2740' $$,
  '23514',
  null,
  'A ZIP code must be five digits'
);

select cwr_test.create_fixture();
select cwr_test.sign_out();
set local role anon;

select isnt_empty(
  $$ select 1 from cwr.site_settings s join cwr.tenants t on t.id = s.tenant_id where t.slug = 'cwr' $$,
  'Visitors can read the contact details'
);

reset role;
select cwr_test.sign_in('staff');
set local role authenticated;
select is_empty(
  $$ update cwr.site_settings set email = 'staff@example.com' returning 1 $$,
  'Staff cannot change the contact details'
);
select is_empty(
  $$ update cwr.site_settings set is_connections_page_visible = false returning 1 $$,
  'Staff cannot hide the Connections page'
);

-- Connections page switch (owners only, 2026-10-09) -----------------------------------
reset role;
select cwr_test.sign_in('manager');
set local role authenticated;
select lives_ok(
  $$ insert into cwr.site_settings (tenant_id, phone, email) values (cwr_test.id('tenant_a'), '+13365550100', 'office@example.com') $$,
  'A manager can add contact settings, which start with the Connections page showing'
);
select throws_ok(
  $$ update cwr.site_settings set is_connections_page_visible = false where tenant_id = cwr_test.id('tenant_a') $$,
  '42501',
  null,
  'A manager cannot hide the Connections page, even outside the website'
);
-- Password-only sessions (owner choice 2026-10-09): no authenticator code needed.
reset role;
select cwr_test.sign_in('owner', 'aal1');
set local role authenticated;
select isnt_empty(
  $$ update cwr.site_settings set email = 'owner@example.com' where tenant_id = cwr_test.id('tenant_a') returning 1 $$,
  'An owner signed in with a password alone can change the contact details'
);
select lives_ok(
  $$ update cwr.site_settings set is_connections_page_visible = false where tenant_id = cwr_test.id('tenant_a') $$,
  'An owner signed in with a password alone can hide the Connections page'
);
reset role;

select * from finish();
rollback;

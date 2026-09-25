-- Contact details the public site reads (Admin §4) and who may change them.
begin;
select plan(5);

select results_eq(
  $$ select s.phone, s.email, s.office_city, s.license_number
     from cwr.site_settings s join cwr.tenants t on t.id = s.tenant_id where t.slug = 'cwr' $$,
  $$ values ('+13367080560', 'charlie@charliewardrealty.com', 'Greensboro', 'C31457') $$,
  'The CWR tenant ships with its contact details'
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

reset role;
select cwr_test.sign_in('owner', 'aal1');
set local role authenticated;
select is_empty(
  $$ update cwr.site_settings set email = 'owner@example.com' returning 1 $$,
  'Even an owner cannot change them without a multi-factor sign-in'
);

select * from finish();
rollback;

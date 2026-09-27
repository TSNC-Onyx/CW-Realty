-- Connections (referral partners): visitors read visible ones, owners and managers edit,
-- staff cannot, and only owners delete from the trash. Built like team members.
begin;
select plan(11);
select cwr_test.create_fixture();

insert into cwr.connections (id, tenant_id, full_name, category, title_line, is_visible) values
  ('f1000000-0000-0000-0000-000000000001', cwr_test.id('tenant_a'), 'Visible Partner', 'Lending', 'Loan officer', true),
  ('f1000000-0000-0000-0000-000000000002', cwr_test.id('tenant_a'), 'Hidden Partner', 'Insurance', 'Insurance agent', false),
  ('f1000000-0000-0000-0000-000000000003', cwr_test.id('tenant_a'), 'Third Partner', 'Insurance', 'Insurance agent', true);

select throws_ok(
  $$ insert into cwr.connections (tenant_id, full_name, category) values (cwr_test.id('tenant_a'), 'Bad Category', 'Plumbing') $$,
  '23514',
  null,
  'Only the listed categories are allowed'
);

select throws_ok(
  $$ insert into cwr.connections (tenant_id, full_name, category, website) values (cwr_test.id('tenant_a'), 'Bad Site', 'Other', 'javascript:alert(1)') $$,
  '23514',
  null,
  'A website must be an http or https address'
);

select cwr_test.sign_out();
set local role anon;
select results_eq(
  $$ select full_name from cwr.connections where tenant_id = cwr_test.id('tenant_a') order by full_name $$,
  array['Third Partner', 'Visible Partner'],
  'Visitors see only visible connections'
);

reset role;
select cwr_test.sign_in('staff');
set local role authenticated;
select throws_ok(
  $$ insert into cwr.connections (tenant_id, full_name, category) values (cwr_test.id('tenant_a'), 'Staff Added', 'Other') $$,
  '42501',
  null,
  'Staff cannot add connections'
);

reset role;
select cwr_test.sign_in('outsider');
set local role authenticated;
select is_empty(
  $$ select 1 from cwr.connections where full_name = 'Hidden Partner' $$,
  'Another tenant cannot see hidden connections'
);

reset role;
select cwr_test.sign_in('manager');
set local role authenticated;
select lives_ok(
  $$ insert into cwr.connections (tenant_id, full_name, category, phone, website)
     values (cwr_test.id('tenant_a'), 'Manager Added', 'Home warranty', '+13365550100', 'https://example.com') $$,
  'Managers can add connections'
);

select cwr.move_item('connections', 'f1000000-0000-0000-0000-000000000003', 'up');
select results_eq(
  $$ select full_name from cwr.connections where tenant_id = cwr_test.id('tenant_a') and deleted_at is null and full_name <> 'Manager Added' order by sort_order $$,
  array['Visible Partner', 'Third Partner', 'Hidden Partner'],
  'Managers can reorder connections'
);

update cwr.connections set deleted_at = now() where id = 'f1000000-0000-0000-0000-000000000002';
select results_eq(
  $$ select label from cwr.trash where item_type = 'connections' and tenant_id = cwr_test.id('tenant_a') $$,
  array['Hidden Partner'],
  'A trashed connection appears in the trash'
);

delete from cwr.connections where id = 'f1000000-0000-0000-0000-000000000002';
select isnt_empty(
  $$ select 1 from cwr.connections where id = 'f1000000-0000-0000-0000-000000000002' $$,
  'Managers cannot delete connections forever'
);

reset role;
select cwr_test.sign_in('owner');
set local role authenticated;
delete from cwr.connections where id = 'f1000000-0000-0000-0000-000000000002';
select is_empty(
  $$ select 1 from cwr.connections where id = 'f1000000-0000-0000-0000-000000000002' $$,
  'Owners can delete a trashed connection forever'
);

reset role;
update cwr.connections set deleted_at = now() - interval '31 days' where id = 'f1000000-0000-0000-0000-000000000003';
select cwr.purge_trash();
select is_empty(
  $$ select 1 from cwr.connections where id = 'f1000000-0000-0000-0000-000000000003' $$,
  'The trash purge removes connections after 30 days'
);

select * from finish();
rollback;

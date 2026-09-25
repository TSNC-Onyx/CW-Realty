-- Admin reordering (cwr.move_item): one transaction, editors only.
begin;
select plan(6);
select cwr_test.create_fixture();

insert into cwr.team_members (id, tenant_id, slug, full_name) values
  ('f0000000-0000-0000-0000-000000000001', cwr_test.id('tenant_a'), 'first-member', 'First Member'),
  ('f0000000-0000-0000-0000-000000000002', cwr_test.id('tenant_a'), 'second-member', 'Second Member'),
  ('f0000000-0000-0000-0000-000000000003', cwr_test.id('tenant_a'), 'third-member', 'Third Member');

select cwr_test.sign_in('manager');
set local role authenticated;

select cwr.move_item('team_members', 'f0000000-0000-0000-0000-000000000003', 'up');
select results_eq(
  $$ select slug from cwr.team_members where tenant_id = cwr_test.id('tenant_a') and deleted_at is null order by sort_order $$,
  array['first-member', 'third-member', 'second-member'],
  'Moving up swaps with the item above, even when every sort order started equal'
);

select cwr.move_item('team_members', 'f0000000-0000-0000-0000-000000000001', 'up');
select results_eq(
  $$ select slug from cwr.team_members where tenant_id = cwr_test.id('tenant_a') and deleted_at is null order by sort_order $$,
  array['first-member', 'third-member', 'second-member'],
  'Moving the first item up changes nothing'
);

select throws_ok(
  $$ select cwr.move_item('memberships', 'f0000000-0000-0000-0000-000000000001', 'up') $$,
  '22023',
  'This list cannot be reordered',
  'Only listings, team members, and listing photos can be reordered'
);

reset role;
select cwr_test.sign_in('staff');
set local role authenticated;
select throws_ok(
  $$ select cwr.move_item('listings', cwr_test.id('live_listing'), 'down') $$,
  '42501',
  'Your role cannot reorder this list',
  'Staff cannot reorder'
);

reset role;
select cwr_test.sign_in('owner', 'aal1');
set local role authenticated;
select throws_ok(
  $$ select cwr.move_item('team_members', 'f0000000-0000-0000-0000-000000000001', 'down') $$,
  '42501',
  'Your role cannot reorder this list',
  'An owner without a multi-factor sign-in cannot reorder'
);

reset role;
select ok(
  not has_function_privilege('anon', 'cwr.move_item(text, uuid, text)', 'execute'),
  'Visitors cannot call the reorder function'
);

select * from finish();
rollback;

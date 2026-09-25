-- Row Level Security per role (Infra §2, Admin §7). Role access table:
-- docs/cwr-website-build-plan.md → "Role access".
begin;
select plan(26);
select cwr_test.create_fixture();

-- ---------------------------------------------------------------- visitors
select cwr_test.sign_out();
set local role anon;

select results_eq(
  $$ select id from cwr.listings where tenant_id = cwr_test.id('tenant_a') $$,
  array[cwr_test.id('live_listing')],
  'Visitors see only live listings'
);
select is((select count(*)::int from cwr.listing_photos), 1, 'Visitors see photos of live listings only');
select throws_ok(
  $$ select * from cwr.inbox_threads $$, '42501', null, 'Visitors cannot read the inbox'
);
select throws_ok(
  $$ select * from cwr.memberships $$, '42501', null, 'Visitors cannot read memberships'
);
select throws_ok(
  $$ insert into cwr.listings (tenant_id, slug, street_address, city, postal_code, price_cents, description)
     values (cwr_test.id('tenant_a'), 'x-st', 'X St', 'Greensboro', '27401', 1, 'x') $$,
  '42501', null, 'Visitors cannot add listings'
);

-- ---------------------------------------------------------------- MFA
reset role;
select cwr_test.sign_in('owner', 'aal1');
set local role authenticated;

select is(
  (select count(*)::int from cwr.listings where tenant_id = cwr_test.id('tenant_a')), 1,
  'An owner without a verified second factor sees only public listings'
);
select throws_ok(
  $$ insert into cwr.team_members (tenant_id, slug, full_name) values (cwr_test.id('tenant_a'), 'no-mfa', 'No MFA') $$,
  '42501', null, 'An owner without a verified second factor cannot edit'
);

-- ---------------------------------------------------------------- owner
reset role;
select cwr_test.sign_in('owner');
set local role authenticated;

select is(
  (select count(*)::int from cwr.listings where tenant_id = cwr_test.id('tenant_a')), 2,
  'Owners see draft and live listings'
);
select is((select count(*)::int from cwr.chat_policies), 1, 'Owners read the chatbot policy');
select ok((select count(*) > 0 from cwr.audit_log), 'Owners read the audit log');
select lives_ok(
  $$ insert into cwr.memberships (tenant_id, user_id, role)
     values (cwr_test.id('tenant_a'), cwr_test.id('outsider'), 'staff') $$,
  'Owners can add users'
);

-- ---------------------------------------------------------------- manager
reset role;
select cwr_test.sign_in('manager');
set local role authenticated;

select lives_ok(
  $$ update cwr.listings set description = 'Updated by manager' where id = cwr_test.id('draft_listing') $$,
  'Managers edit listings'
);
select is((select count(*)::int from cwr.inbox_threads), 2, 'Managers see every inbox thread');
select is((select count(*)::int from cwr.chat_policies), 0, 'Managers cannot see the chatbot policy');
select results_eq(
  $$ with removed as (delete from cwr.listings where id = cwr_test.id('draft_listing') returning 1)
     select count(*)::int from removed $$,
  array[0],
  'Managers cannot permanently delete listings'
);
select throws_ok(
  $$ insert into cwr.memberships (tenant_id, user_id, role)
     values (cwr_test.id('tenant_a'), cwr_test.id('outsider'), 'manager') $$,
  '42501', null, 'Managers cannot add users'
);
select is((select count(*)::int from cwr.audit_log), 0, 'Managers cannot read the audit log');

-- ---------------------------------------------------------------- staff
reset role;
select cwr_test.sign_in('staff');
set local role authenticated;

select results_eq(
  $$ select id from cwr.inbox_threads $$,
  array[cwr_test.id('staff_thread')],
  'Staff see only threads assigned to them'
);
select lives_ok(
  $$ insert into cwr.inbox_messages (tenant_id, thread_id, kind, body, author_id)
     values (cwr_test.id('tenant_a'), cwr_test.id('staff_thread'), 'internal_note', 'Called back', cwr_test.id('staff')) $$,
  'Staff add notes to their assigned threads'
);
select throws_ok(
  $$ insert into cwr.inbox_messages (tenant_id, thread_id, kind, body, author_id)
     values (cwr_test.id('tenant_a'), cwr_test.id('other_thread'), 'internal_note', 'Sneaky', cwr_test.id('staff')) $$,
  '42501', null, 'Staff cannot write to threads assigned to someone else'
);
select throws_ok(
  $$ update cwr.inbox_threads set assignee_id = cwr_test.id('other_staff') where id = cwr_test.id('staff_thread') $$,
  '42501', null, 'Staff cannot hand their thread to someone else'
);
select is(
  (select count(*)::int from cwr.listings where tenant_id = cwr_test.id('tenant_a')), 1,
  'Staff see only public listings'
);
select is((select count(*)::int from cwr.notification_recipients), 0, 'Staff cannot see alert recipients');

-- ---------------------------------------------------------------- other tenant
reset role;
select cwr_test.sign_in('outsider');
set local role authenticated;

select is(
  (select count(*)::int from cwr.listings where tenant_id = cwr_test.id('tenant_a')), 1,
  'Another tenant''s owner sees only tenant A''s public listings'
);
select is((select count(*)::int from cwr.inbox_threads), 0, 'Another tenant''s owner sees none of tenant A''s inbox');
select throws_ok(
  $$ update cwr.listings set tenant_id = cwr_test.id('tenant_a') where id = cwr_test.id('tenant_b_listing') $$,
  '42501', null, 'A record cannot be moved into another tenant'
);

select * from finish();
rollback;

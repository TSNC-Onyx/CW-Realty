-- Workflow engine: status changes only through cwr.transition(), with role rules
-- and business checks (Infra §4, Admin §2 and §6).
begin;
select plan(17);
select cwr_test.create_fixture();

-- ---------------------------------------------------------------- direct writes are blocked
reset role;
select cwr_test.sign_in('manager');
set local role authenticated;

select throws_ok(
  $$ update cwr.listings set status = 'sold' where id = cwr_test.id('live_listing') $$,
  '42501', 'Status changes must go through cwr.transition()',
  'A status cannot be changed by a direct update'
);
select throws_ok(
  $$ insert into cwr.listings (tenant_id, slug, street_address, city, postal_code, price_cents, description, publish_state)
     values (cwr_test.id('tenant_a'), '9-live-st', '9 Live St', 'Greensboro', '27401', 1, 'x', 'live') $$,
  '42501', 'Status changes must go through cwr.transition()',
  'A new listing cannot skip straight to live'
);

-- ---------------------------------------------------------------- listing rules
select throws_ok(
  $$ select cwr.transition('listing_publish', cwr_test.id('draft_listing'), 'live') $$,
  '23514', 'Add at least one photo before publishing this listing',
  'A listing cannot go live without a photo'
);
select lives_ok(
  $$ select cwr.transition('listing_status', cwr_test.id('live_listing'), 'sold') $$,
  'Managers can mark a listing sold'
);
select is(
  (select status::text from cwr.listings where id = cwr_test.id('live_listing')), 'sold',
  'The sold listing keeps its page, labeled sold'
);
select throws_ok(
  $$ select cwr.transition('listing_status', cwr_test.id('live_listing'), 'pending') $$,
  '23514', null, 'Moves that are not in the workflow are refused'
);

reset role;
select results_eq(
  $$ select action, old_values ->> 'status', new_values ->> 'status' from cwr.audit_log
     where record_id = cwr_test.id('live_listing') and action = 'transition'
       and new_values ->> 'status' = 'sold' $$,
  $$ values ('transition', 'active', 'sold') $$,
  'Each transition is audited with before and after values'
);
select is(
  (select actor_id from cwr.audit_log
   where record_id = cwr_test.id('live_listing') and new_values ->> 'status' = 'sold'),
  cwr_test.id('manager'),
  'The audit entry records who made the change'
);

-- ---------------------------------------------------------------- inbox rules
select cwr_test.sign_in('staff');
set local role authenticated;

select lives_ok(
  $$ select cwr.transition('inbox_status', cwr_test.id('staff_thread'), 'closed') $$,
  'Staff can close their own thread'
);
select isnt(
  (select closed_at from cwr.inbox_threads where id = cwr_test.id('staff_thread')), null,
  'Closing a thread starts its retention clock'
);
select throws_ok(
  $$ select cwr.transition('inbox_status', cwr_test.id('other_thread'), 'closed') $$,
  'P0002', null, 'Staff cannot move a thread assigned to someone else'
);
select throws_ok(
  $$ select cwr.transition('inbox_status', cwr_test.id('staff_thread'), 'assigned') $$,
  '42501', 'Your role cannot make this change', 'Only owners and managers reopen closed threads'
);

-- ---------------------------------------------------------------- chatbot policy rules
reset role;
select cwr_test.sign_in('owner');
set local role authenticated;

select throws_ok(
  $$ select cwr.transition('chat_policy_status', cwr_test.id('draft_policy'), 'published') $$,
  '23514', 'Run the policy tests and pass them before publishing',
  'A policy cannot publish without a passing test run'
);

reset role;
insert into cwr.chat_policy_test_runs (tenant_id, policy_id, is_passed)
values (cwr_test.id('tenant_a'), cwr_test.id('draft_policy'), true);
select cwr_test.sign_in('owner');
set local role authenticated;

select lives_ok(
  $$ select cwr.transition('chat_policy_status', cwr_test.id('draft_policy'), 'published') $$,
  'A policy publishes after its tests pass'
);
select throws_ok(
  $$ update cwr.chat_policies set body = 'Rewritten history' where id = cwr_test.id('draft_policy') $$,
  '23514', 'Only draft policy versions can be edited',
  'Published policy text is frozen'
);

-- ---------------------------------------------------------------- owners
select throws_ok(
  $$ delete from cwr.memberships where user_id = cwr_test.id('owner') and tenant_id = cwr_test.id('tenant_a') $$,
  '23514', 'A tenant must keep at least one owner',
  'The last owner cannot be removed'
);
select throws_ok(
  $$ update cwr.audit_log set actor_role = 'forged' $$,
  '42501', null, 'Nobody can edit the audit log'
);

select * from finish();
rollback;

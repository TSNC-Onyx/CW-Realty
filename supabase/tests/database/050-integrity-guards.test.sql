-- Guards against forged dates, skipped trash, broken redirects, and orphaned work.
begin;
select plan(19);
select cwr_test.create_fixture();

-- ---------------------------------------------------------------- trash cannot be forged
select cwr_test.sign_in('manager');
set local role authenticated;

update cwr.listings set deleted_at = now() - interval '31 days' where id = cwr_test.id('draft_listing');
select ok(
  (select deleted_at >= now() - interval '1 minute' from cwr.listings where id = cwr_test.id('draft_listing')),
  'A manager cannot backdate trash to force a permanent delete'
);

reset role;
select cwr_test.sign_in('owner');
set local role authenticated;

select results_eq(
  $$ with removed as (delete from cwr.listings where id = cwr_test.id('live_listing') returning 1)
     select count(*)::int from removed $$,
  array[0],
  'Owners cannot permanently delete a listing that is not in the trash'
);
select results_eq(
  $$ with removed as (delete from cwr.listings where id = cwr_test.id('draft_listing') returning 1)
     select count(*)::int from removed $$,
  array[1],
  'Owners can permanently delete a listing from the trash'
);

-- ---------------------------------------------------------------- retention clock cannot be forged
reset role;
select cwr_test.sign_in('staff');
set local role authenticated;

select cwr.transition('inbox_status', cwr_test.id('staff_thread'), 'closed');
update cwr.inbox_threads set closed_at = now() - interval '2 years' where id = cwr_test.id('staff_thread');
select ok(
  (select closed_at >= now() - interval '1 minute' from cwr.inbox_threads where id = cwr_test.id('staff_thread')),
  'Staff cannot backdate a closed thread to force early deletion'
);

reset role;
select cwr_test.sign_in('manager');
set local role authenticated;

update cwr.inbox_threads set closed_at = null where id = cwr_test.id('staff_thread');
select isnt(
  (select closed_at from cwr.inbox_threads where id = cwr_test.id('staff_thread')), null,
  'A manager cannot clear the close date to keep a thread forever'
);
select throws_ok(
  $$ delete from cwr.inbox_threads where id = cwr_test.id('staff_thread') $$,
  '42501', null, 'Inbox threads are never deleted by users'
);

-- ---------------------------------------------------------------- assigned threads keep an assignee
select throws_ok(
  $$ update cwr.inbox_threads set assignee_id = null where id = cwr_test.id('other_thread') $$,
  '23514', null, 'An assigned thread cannot be left without an assignee'
);

reset role;
select cwr_test.sign_in('owner');
set local role authenticated;

select throws_ok(
  $$ delete from cwr.memberships where user_id = cwr_test.id('other_staff') $$,
  '23514', null, 'A user holding assigned threads cannot be removed until they are reassigned'
);

-- ---------------------------------------------------------------- live listings keep a photo
select throws_ok(
  $$ update cwr.listing_photos set deleted_at = now() where listing_id = cwr_test.id('live_listing') $$,
  '23514', null, 'The last photo of a live listing cannot be removed'
);

select throws_ok(
  $$ update cwr.listing_photos set listing_id = cwr_test.id('draft_listing') where listing_id = cwr_test.id('live_listing') $$,
  '23514', null, 'A photo cannot be moved off a live listing'
);

-- Trash the live listing, then its only photo, then try to restore the listing.
update cwr.listings set deleted_at = now() where id = cwr_test.id('live_listing');
update cwr.listing_photos set deleted_at = now() where listing_id = cwr_test.id('live_listing');
select throws_ok(
  $$ update cwr.listings set deleted_at = null where id = cwr_test.id('live_listing') $$,
  '23514', 'Add at least one photo before publishing this listing',
  'A live listing cannot be restored from trash without a photo'
);
update cwr.listing_photos set deleted_at = null where listing_id = cwr_test.id('live_listing');
update cwr.listings set deleted_at = null where id = cwr_test.id('live_listing');

insert into cwr.team_members (tenant_id, slug, full_name, deleted_at)
values (cwr_test.id('tenant_a'), 'backdated', 'Backdated', now() - interval '31 days');
select ok(
  (select deleted_at >= now() - interval '1 minute' from cwr.team_members where slug = 'backdated'),
  'A new record cannot be created already backdated in the trash'
);

-- ---------------------------------------------------------------- chatbot tests changed after a pass
reset role;
insert into cwr.chat_policy_test_runs (tenant_id, policy_id, is_passed, ran_at)
values (cwr_test.id('tenant_a'), cwr_test.id('draft_policy'), true, now());
insert into cwr.chat_policy_tests (tenant_id, question, expected_outcome, updated_at)
values (cwr_test.id('tenant_a'), 'Can you tell me which neighborhoods are safest?', 'handoff', now() + interval '1 second');
select cwr_test.sign_in('owner');
set local role authenticated;

select throws_ok(
  $$ select cwr.transition('chat_policy_status', cwr_test.id('draft_policy'), 'published') $$,
  '23514', 'Run the policy tests and pass them before publishing',
  'Changing the preset questions requires a fresh passing run'
);

-- ---------------------------------------------------------------- redirects
reset role;
select cwr_test.sign_in('manager');
set local role authenticated;

insert into cwr.redirects (tenant_id, source_path, target_path, origin)
values (cwr_test.id('tenant_a'), '/old-b', '/new-c', 'legacy');
insert into cwr.redirects (tenant_id, source_path, target_path, origin)
values (cwr_test.id('tenant_a'), '/old-a', '/old-b', 'legacy');
select results_eq(
  $$ select target_path from cwr.redirects where source_path = '/old-a' $$,
  array['/new-c'],
  'A redirect added by hand is flattened to one hop'
);
select throws_ok(
  $$ insert into cwr.redirects (tenant_id, source_path, target_path, origin)
     values (cwr_test.id('tenant_a'), '/new-c', '/old-a', 'legacy') $$,
  '23514', null, 'A redirect loop is refused'
);

insert into cwr.team_members (tenant_id, slug, full_name)
values (cwr_test.id('tenant_a'), 'jane-doe', 'Jane Doe');
update cwr.team_members set slug = 'jane-smith' where slug = 'jane-doe';
update cwr.team_members set deleted_at = now() where slug = 'jane-smith';
update cwr.team_members set deleted_at = null where slug = 'jane-smith';
select results_eq(
  $$ select target_path from cwr.redirects where source_path = '/team/jane-doe' $$,
  array['/team/jane-smith'],
  'Restoring from trash brings back every old URL of the record'
);

insert into cwr.redirects (tenant_id, source_path, target_path, origin)
values (cwr_test.id('tenant_a'), '/jane-smith-cwr', '/team/jane-smith', 'legacy');
update cwr.team_members set deleted_at = now() where slug = 'jane-smith';
update cwr.team_members set deleted_at = null where slug = 'jane-smith';
select results_eq(
  $$ select target_path from cwr.redirects where source_path = '/jane-smith-cwr' $$,
  array['/team/jane-smith'],
  'Restoring from trash also brings back old-website redirects'
);

update cwr.team_members set is_visible = false where slug = 'jane-smith';
reset role;
select cwr_test.sign_out();
set local role anon;

select ok(
  cwr.is_hidden_team_member(cwr_test.id('tenant_a'), 'jane-smith'),
  'The site can tell a hidden member apart from a missing page'
);
select ok(
  not cwr.is_hidden_team_member(cwr_test.id('tenant_a'), 'no-such-person'),
  'A missing member is not reported as hidden'
);

select * from finish();
rollback;

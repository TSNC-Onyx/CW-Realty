-- Listing statuses (docs/cwr-listing-statuses-plan.md): Coming Soon, For Sale, Under
-- Contract, Sold in that order; new listings start as Coming Soon; skips and three
-- back moves are allowed; everything else is refused.
begin;
select plan(11);
select cwr_test.create_fixture();

-- ---------------------------------------------------------------- names, order, start
select results_eq(
  $$ select unnest(enum_range(null::cwr.listing_status))::text $$,
  $$ values ('coming_soon'), ('for_sale'), ('under_contract'), ('sold') $$,
  'Statuses are named and ordered as the owner chose'
);
select is(
  (select status::text from cwr.listings where id = cwr_test.id('draft_listing')),
  'coming_soon',
  'A new listing starts as Coming Soon'
);
select throws_ok(
  $$ insert into cwr.listings (tenant_id, slug, street_address, city, postal_code, price_cents, description, status)
     values (cwr_test.id('tenant_a'), '8-sale-st', '8 Sale St', 'Greensboro', '27401', 1, 'x', 'for_sale') $$,
  '42501', 'Status changes must go through cwr.transition()',
  'A new listing cannot start past Coming Soon'
);

-- ---------------------------------------------------------------- the move table
select results_eq(
  $$ select t.from_state, t.to_state from cwr.workflow_transitions t
     join cwr.workflows w on w.id = t.workflow_id
     where w.key = 'listing_status' and w.tenant_id = cwr_test.id('tenant_a')
     order by 1, 2 $$,
  $$ values ('coming_soon', 'for_sale'), ('coming_soon', 'sold'), ('coming_soon', 'under_contract'),
            ('for_sale', 'coming_soon'), ('for_sale', 'sold'), ('for_sale', 'under_contract'),
            ('sold', 'for_sale'),
            ('under_contract', 'for_sale'), ('under_contract', 'sold') $$,
  'Every tenant gets exactly the owner-chosen moves'
);
select is(
  (select count(*)::int from cwr.workflows where key = 'listing_status'),
  (select count(*)::int from cwr.tenants),
  'Each tenant has one listing status workflow'
);

-- ---------------------------------------------------------------- moves as a manager
select cwr_test.sign_in('manager');
set local role authenticated;

select lives_ok(
  $$ select cwr.transition('listing_status', cwr_test.id('draft_listing'), 'under_contract') $$,
  'Coming Soon can skip straight to Under Contract'
);
select lives_ok(
  $$ select cwr.transition('listing_status', cwr_test.id('draft_listing'), 'for_sale') $$,
  'A deal that falls through goes back to For Sale'
);
select lives_ok(
  $$ select cwr.transition('listing_status', cwr_test.id('draft_listing'), 'coming_soon') $$,
  'For Sale can go back to Coming Soon'
);
select lives_ok(
  $$ select cwr.transition('listing_status', cwr_test.id('draft_listing'), 'sold') $$,
  'Coming Soon can skip straight to Sold'
);
select throws_ok(
  $$ select cwr.transition('listing_status', cwr_test.id('draft_listing'), 'coming_soon') $$,
  '23514', null, 'Sold cannot go back to Coming Soon'
);

-- ---------------------------------------------------------------- roles
reset role;
select is(
  (select count(*)::int from cwr.workflow_transitions t
   join cwr.workflows w on w.id = t.workflow_id
   where w.key = 'listing_status' and t.allowed_roles <> '{owner,manager}'::cwr.member_role[]),
  0,
  'Only owners and managers may change a listing status'
);

select * from finish();
rollback;

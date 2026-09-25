-- Old Wix URLs (navigation-reconciliation.md) and team portrait sizes.
begin;
select plan(5);

select is(
  (select count(*)::int from cwr.redirects r join cwr.tenants t on t.id = r.tenant_id
   where t.slug = 'cwr' and r.origin = 'legacy'),
  21,
  'Every old Wix URL has a redirect'
);

select is_empty(
  $$ select r.source_path from cwr.redirects r
     join cwr.redirects hop on hop.tenant_id = r.tenant_id and hop.source_path = r.target_path $$,
  'No redirect leads to another redirect (one hop only)'
);

select results_eq(
  $$ select r.target_path, r.status_code::int from cwr.redirects r join cwr.tenants t on t.id = r.tenant_id
     where t.slug = 'cwr' and r.source_path = '/copy-of-russell-casey' $$,
  $$ values ('/team/ashley-edwards', 301) $$,
  'The mislabeled Wix page goes to Ashley Edwards permanently'
);

select throws_ok(
  $$ insert into cwr.team_members (tenant_id, slug, full_name, photo_path, photo_alt)
     select id, 'no-size', 'No Size', 'team/no-size', 'Portrait' from cwr.tenants where slug = 'cwr' $$,
  '23514',
  null,
  'A portrait must record its size'
);

select lives_ok(
  $$ insert into cwr.team_members (tenant_id, slug, full_name, photo_path, photo_alt, photo_width, photo_height)
     select id, 'with-size', 'With Size', 'team/with-size', 'Portrait', 800, 1000 from cwr.tenants where slug = 'cwr' $$,
  'A portrait with its size is accepted'
);

select * from finish();
rollback;

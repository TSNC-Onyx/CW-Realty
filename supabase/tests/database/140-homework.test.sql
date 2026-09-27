-- Homework items: rules for each kind, visitors read visible items only, editors change
-- them, staff cannot, reordering stays inside one list, and the trash works like the rest.
begin;
select plan(14);
select cwr_test.create_fixture();

insert into cwr.homework_items (id, tenant_id, kind, group_key, title, file_path, file_name, file_mime, file_size_bytes, is_visible) values
  ('f2000000-0000-0000-0000-000000000001', cwr_test.id('tenant_a'), 'file', 'buyers', 'Buyer guide', 'homework/a/b/buyer.pdf', 'Buyer.pdf', 'application/pdf', 1000, true),
  ('f2000000-0000-0000-0000-000000000002', cwr_test.id('tenant_a'), 'file', 'sellers', 'Seller guide one', 'homework/a/c/one.pdf', 'One.pdf', 'application/pdf', 1000, true),
  ('f2000000-0000-0000-0000-000000000003', cwr_test.id('tenant_a'), 'file', 'sellers', 'Seller guide two', 'homework/a/d/two.pdf', 'Two.pdf', 'application/pdf', 1000, true),
  ('f2000000-0000-0000-0000-000000000004', cwr_test.id('tenant_a'), 'file', 'buyers', 'Hidden draft', null, null, null, null, false);
insert into cwr.homework_items (id, tenant_id, kind, title, file_path, file_name, file_mime, file_size_bytes, duration_seconds, is_visible) values
  ('f2000000-0000-0000-0000-000000000005', cwr_test.id('tenant_a'), 'video', 'Test video', 'homework/a/e/video.mp4', 'Video.mp4', 'video/mp4', 5000, 74, true);

select throws_ok(
  $$ insert into cwr.homework_items (tenant_id, kind, group_key, title, is_visible) values (cwr_test.id('tenant_a'), 'file', 'buyers', 'No file yet', true) $$,
  '23514', null,
  'A guide cannot be shown before its file is uploaded'
);
select throws_ok(
  $$ insert into cwr.homework_items (tenant_id, kind, group_key, title) values (cwr_test.id('tenant_a'), 'video', 'buyers', 'Grouped video') $$,
  '23514', null,
  'Videos have no download group'
);
select throws_ok(
  $$ insert into cwr.homework_items (tenant_id, kind, group_key, title) values (cwr_test.id('tenant_a'), 'link', 'required', 'Link without address') $$,
  '23514', null,
  'A link needs a web address'
);
select throws_ok(
  $$ insert into cwr.homework_items (tenant_id, kind, group_key, title, link_url) values (cwr_test.id('tenant_a'), 'link', 'required', 'Plain http', 'http://example.com') $$,
  '23514', null,
  'A link must use https'
);
select throws_ok(
  $$ insert into cwr.homework_items (tenant_id, kind, group_key, title, captions_path) values (cwr_test.id('tenant_a'), 'file', 'buyers', 'Guide with captions', 'homework/a/f/x.vtt') $$,
  '23514', null,
  'Only videos have captions'
);

select cwr_test.sign_out();
set local role anon;
select results_eq(
  $$ select title from cwr.homework_items where tenant_id = cwr_test.id('tenant_a') order by title $$,
  array['Buyer guide', 'Seller guide one', 'Seller guide two', 'Test video'],
  'Visitors see only visible homework'
);

reset role;
select cwr_test.sign_in('staff');
set local role authenticated;
select throws_ok(
  $$ insert into cwr.homework_items (tenant_id, kind, title) values (cwr_test.id('tenant_a'), 'video', 'Staff video') $$,
  '42501', null,
  'Staff cannot add homework'
);

reset role;
select cwr_test.sign_in('outsider');
set local role authenticated;
select is_empty(
  $$ select 1 from cwr.homework_items where title = 'Hidden draft' $$,
  'Another tenant cannot see hidden homework'
);

reset role;
select cwr_test.sign_in('manager');
set local role authenticated;
select lives_ok(
  $$ insert into cwr.homework_items (tenant_id, kind, group_key, title, link_url, is_visible)
     values (cwr_test.id('tenant_a'), 'link', 'required', 'Agency brochure', 'https://www.ncrec.gov/Brochures/Print/WWREAPrint.pdf', true) $$,
  'Managers can add a link and show it right away'
);

select cwr.move_homework_item('f2000000-0000-0000-0000-000000000003', 'up');
select results_eq(
  $$ select title from cwr.homework_items where tenant_id = cwr_test.id('tenant_a') and list_key = 'sellers' and deleted_at is null order by sort_order $$,
  array['Seller guide two', 'Seller guide one'],
  'Moving up swaps with the item above in the same group'
);
select results_eq(
  $$ select title from cwr.homework_items where tenant_id = cwr_test.id('tenant_a') and list_key = 'buyers' and deleted_at is null order by sort_order, id $$,
  array['Buyer guide', 'Hidden draft'],
  'Other groups keep their order'
);

update cwr.homework_items set deleted_at = now() where id = 'f2000000-0000-0000-0000-000000000004';
select results_eq(
  $$ select label from cwr.trash where item_type = 'homework_items' and tenant_id = cwr_test.id('tenant_a') $$,
  array['Hidden draft'],
  'A trashed item appears in the trash'
);

delete from cwr.homework_items where id = 'f2000000-0000-0000-0000-000000000004';
select isnt_empty(
  $$ select 1 from cwr.homework_items where id = 'f2000000-0000-0000-0000-000000000004' $$,
  'Managers cannot delete homework forever'
);

reset role;
update cwr.homework_items set deleted_at = now() - interval '31 days' where id = 'f2000000-0000-0000-0000-000000000004';
select cwr.purge_trash();
select is_empty(
  $$ select 1 from cwr.homework_items where id = 'f2000000-0000-0000-0000-000000000004' $$,
  'The trash purge removes homework after 30 days'
);

select * from finish();
rollback;

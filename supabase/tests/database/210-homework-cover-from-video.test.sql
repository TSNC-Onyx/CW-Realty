-- Automatic video covers (docs/cwr-video-auto-cover-plan.md): the "made from the video"
-- flag only exists alongside a cover, starts false, and clears with the cover.
begin;
select plan(4);
select cwr_test.create_fixture();

insert into cwr.homework_items (id, tenant_id, kind, title, file_path, file_name, file_mime, file_size_bytes, duration_seconds, is_visible) values
  ('f3000000-0000-0000-0000-000000000001', cwr_test.id('tenant_a'), 'video', 'Cover test video', 'homework/a/e/video.mp4', 'Video.mp4', 'video/mp4', 5000, 74, true);

select is(
  (select is_photo_from_video from cwr.homework_items where id = 'f3000000-0000-0000-0000-000000000001'),
  false,
  'A new item has no automatic cover'
);
select throws_ok(
  $$ update cwr.homework_items set is_photo_from_video = true where id = 'f3000000-0000-0000-0000-000000000001' $$,
  '23514', null,
  'An item cannot be marked as having an automatic cover without a cover'
);
select lives_ok(
  $$ update cwr.homework_items
     set photo_path = 'homework/f3000000-0000-0000-0000-000000000001/a', photo_alt = 'Opening scene of this video',
         photo_width = 320, photo_height = 180, is_photo_from_video = true
     where id = 'f3000000-0000-0000-0000-000000000001' $$,
  'A cover made from the video is saved with its flag'
);
select throws_ok(
  $$ update cwr.homework_items set photo_path = null, photo_alt = null, photo_width = null, photo_height = null
     where id = 'f3000000-0000-0000-0000-000000000001' $$,
  '23514', null,
  'Removing the cover must also clear the automatic flag'
);

select * from finish();
rollback;

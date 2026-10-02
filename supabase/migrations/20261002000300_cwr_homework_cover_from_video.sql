-- A Homework video's cover picture can be made automatically from the video's opening
-- scene when the admin has not uploaded one (owner choice 2026-10-02,
-- docs/cwr-video-auto-cover-plan.md). This flag tells an automatic cover apart from an
-- uploaded one, so a later video upload refreshes only automatic covers.

alter table cwr.homework_items
  add column is_photo_from_video boolean not null default false;

alter table cwr.homework_items
  add constraint homework_items_photo_from_video_needs_photo
  check (not is_photo_from_video or photo_path is not null);

-- Problems while making the cover are recorded under their own action.
insert into cwr.problem_catalog (action, area, label, section_label, spike_codes) values
  ('homework.make_cover', 'homework', 'Make a Homework cover from the video', 'Homework', '{}');

-- Team portraits record their original size so the site can reserve space and
-- offer only real image widths (Style §8, §11.8). Expand-only: nullable columns.

alter table cwr.team_members
  add column photo_width integer check (photo_width > 0),
  add column photo_height integer check (photo_height > 0),
  add constraint team_members_photo_size_with_path
    check ((photo_path is null) = (photo_width is null) and (photo_width is null) = (photo_height is null));

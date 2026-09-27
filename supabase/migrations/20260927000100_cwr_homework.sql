-- Homework: the videos, downloads, and links on /resources, managed by staff in
-- Admin → Homework (owner approval 2026-09-27, docs/cwr-site-review-round-plan.md
-- Round 2). Built like cwr.connections: same access rules, trash, audit log, and photo
-- layout for cover pictures. Video, document, and captions files live in the public
-- cwr-files storage bucket (created by the content import script and supabase/config.toml).

create table cwr.homework_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references cwr.tenants (id) on delete cascade,
  kind text not null check (kind in ('video', 'file', 'link')),
  group_key text check (group_key in ('buyers', 'sellers', 'spanish', 'required')),
  list_key text not null generated always as (case kind when 'video' then 'videos' else group_key end) stored,
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 500),
  is_spanish boolean not null default false,
  file_path text check (length(file_path) <= 500),
  file_name text check (length(file_name) between 1 and 200),
  file_mime text,
  file_size_bytes bigint check (file_size_bytes > 0),
  duration_seconds integer check (duration_seconds > 0),
  captions_path text check (length(captions_path) <= 500),
  link_url text check (link_url ~* '^https://[^\s]+$' and length(link_url) <= 500),
  photo_path text,
  photo_alt text check (photo_alt is null or length(trim(photo_alt)) between 1 and 250),
  photo_width integer check (photo_width > 0),
  photo_height integer check (photo_height > 0),
  is_visible boolean not null default false,
  sort_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Videos sit in their own list; downloads and links always belong to a group.
  constraint homework_items_group_by_kind check ((kind = 'video') = (group_key is null)),
  -- A file's details are recorded together, and only videos have a length or captions.
  constraint homework_items_file_details check (
    (file_path is null) = (file_name is null)
    and (file_path is null) = (file_mime is null)
    and (file_path is null) = (file_size_bytes is null)
  ),
  constraint homework_items_video_only check (kind = 'video' or (duration_seconds is null and captions_path is null)),
  constraint homework_items_link_only check ((kind = 'link') = (link_url is not null)),
  constraint homework_items_no_file_on_links check (kind <> 'link' or file_path is null),
  -- Visitors only ever see items that have something to open.
  constraint homework_items_visible_complete check (not is_visible or kind = 'link' or file_path is not null),
  check ((photo_path is null) = (photo_alt is null)),
  constraint homework_items_photo_size_with_path
    check ((photo_path is null) = (photo_width is null) and (photo_width is null) = (photo_height is null))
);

create index homework_items_tenant_list_idx
  on cwr.homework_items (tenant_id, list_key, sort_order) where deleted_at is null;
create index homework_items_deleted_at_idx
  on cwr.homework_items (deleted_at) where deleted_at is not null;

create trigger homework_items_guard_deleted_at
  before insert or update of deleted_at on cwr.homework_items
  for each row execute function cwr.guard_deleted_at();
create trigger homework_items_set_updated_at
  before update on cwr.homework_items
  for each row execute function cwr.set_updated_at();
create trigger homework_items_record_audit
  after insert or update or delete on cwr.homework_items
  for each row execute function cwr.record_audit();

-- ---------------------------------------------------------------------------
-- Row Level Security: visitors read visible items; owners and managers edit;
-- only owners permanently delete from the trash (same as connections).
-- ---------------------------------------------------------------------------

alter table cwr.homework_items enable row level security;

create policy "Visitors can read visible homework"
  on cwr.homework_items for select
  to anon
  using (is_visible and deleted_at is null);
create policy "Signed-in users read visible homework; editors read all"
  on cwr.homework_items for select
  to authenticated
  using (
    (is_visible and deleted_at is null)
    or tenant_id in (select cwr.editor_tenant_ids())
  );
create policy "Editors can add homework"
  on cwr.homework_items for insert
  to authenticated
  with check (tenant_id in (select cwr.editor_tenant_ids()));
create policy "Editors can change homework"
  on cwr.homework_items for update
  to authenticated
  using (tenant_id in (select cwr.editor_tenant_ids()))
  with check (tenant_id in (select cwr.editor_tenant_ids()));
create policy "Owners can permanently delete homework in trash"
  on cwr.homework_items for delete
  to authenticated
  using (deleted_at is not null and tenant_id in (select cwr.owner_tenant_ids()));

grant select on cwr.homework_items to anon;
grant select, insert, update, delete on cwr.homework_items to authenticated;
grant all on cwr.homework_items to service_role;

-- ---------------------------------------------------------------------------
-- Trash and its 30-day purge include homework items.
-- ---------------------------------------------------------------------------

create or replace view cwr.trash
with (security_invoker = true)
as
  select 'listings'::text as item_type, id, tenant_id, street_address as label,
         deleted_at, deleted_at + interval '30 days' as purge_after
  from cwr.listings where deleted_at is not null
  union all
  select 'listing_photos', id, tenant_id, alt_text,
         deleted_at, deleted_at + interval '30 days'
  from cwr.listing_photos where deleted_at is not null
  union all
  select 'team_members', id, tenant_id, full_name,
         deleted_at, deleted_at + interval '30 days'
  from cwr.team_members where deleted_at is not null
  union all
  select 'closed_deals', d.id, d.tenant_id, 'Closed deal: ' || t.contact_name,
         d.deleted_at, d.deleted_at + interval '30 days'
  from cwr.closed_deals d
  join cwr.inbox_threads t on t.id = d.thread_id and t.tenant_id = d.tenant_id
  where d.deleted_at is not null
  union all
  select 'connections', id, tenant_id, full_name,
         deleted_at, deleted_at + interval '30 days'
  from cwr.connections where deleted_at is not null
  union all
  select 'homework_items', id, tenant_id, title,
         deleted_at, deleted_at + interval '30 days'
  from cwr.homework_items where deleted_at is not null;

create or replace function cwr.purge_trash()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from cwr.listing_photos where deleted_at < now() - interval '30 days';
  delete from cwr.listings where deleted_at < now() - interval '30 days';
  delete from cwr.team_members where deleted_at < now() - interval '30 days';
  delete from cwr.closed_deals where deleted_at < now() - interval '30 days';
  delete from cwr.connections where deleted_at < now() - interval '30 days';
  delete from cwr.homework_items where deleted_at < now() - interval '30 days';
$$;

-- ---------------------------------------------------------------------------
-- Reordering inside one list (the videos, or one download group), with the same
-- rules as cwr.move_item: editors only, one transaction, renumbered 1..n first.
-- ---------------------------------------------------------------------------

create function cwr.move_homework_item(p_id uuid, p_direction text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_step integer := case p_direction when 'up' then -1 when 'down' then 1 end;
  v_tenant_id uuid;
  v_list_key text;
  v_position integer;
  v_neighbor_id uuid;
begin
  if v_step is null then
    raise exception 'Direction must be up or down' using errcode = 'invalid_parameter_value';
  end if;

  select tenant_id, list_key into v_tenant_id, v_list_key
  from cwr.homework_items where id = p_id and deleted_at is null;
  if v_tenant_id is null then
    raise exception 'Item not found' using errcode = 'no_data_found';
  end if;
  if not cwr.is_service_context() and v_tenant_id not in (select cwr.editor_tenant_ids()) then
    raise exception 'Your role cannot reorder this list' using errcode = 'insufficient_privilege';
  end if;

  perform 1 from cwr.homework_items
  where tenant_id = v_tenant_id and list_key = v_list_key and deleted_at is null
  for update;

  update cwr.homework_items t set sort_order = o.position
  from (
    select id, row_number() over (order by sort_order, id)::integer as position
    from cwr.homework_items
    where tenant_id = v_tenant_id and list_key = v_list_key and deleted_at is null
  ) o
  where t.id = o.id and t.sort_order <> o.position;

  select sort_order into v_position from cwr.homework_items where id = p_id;
  select id into v_neighbor_id from cwr.homework_items
  where tenant_id = v_tenant_id and list_key = v_list_key and deleted_at is null and sort_order = v_position + v_step;
  if v_neighbor_id is null then
    return;
  end if;

  update cwr.homework_items
  set sort_order = case when id = p_id then v_position + v_step else v_position end
  where id in (p_id, v_neighbor_id);
end;
$$;

revoke execute on function cwr.move_homework_item(uuid, text) from public, anon;
grant execute on function cwr.move_homework_item(uuid, text) to authenticated, service_role;

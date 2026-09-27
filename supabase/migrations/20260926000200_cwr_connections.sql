-- Connections: the referral partners on /connections, managed by staff in Admin → Connections
-- (owner approval 2026-09-26, docs/cwr-site-review-round-plan.md Step 8). Built like
-- cwr.team_members: same access rules, trash, audit log, reordering, and photo layout.

create table cwr.connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references cwr.tenants (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 1 and 200),
  category text not null check (
    category in ('Lending', 'Insurance', 'Home warranty', 'Contractors and repairs', 'Design and staging', 'Other')
  ),
  title_line text not null default '' check (length(title_line) <= 200),
  phone text check (phone ~ '^\+1[2-9][0-9]{9}$'),
  email text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  website text check (website ~* '^https?://[^\s]+$' and length(website) <= 500),
  photo_path text,
  photo_alt text check (photo_alt is null or length(trim(photo_alt)) between 1 and 250),
  photo_width integer check (photo_width > 0),
  photo_height integer check (photo_height > 0),
  is_visible boolean not null default true,
  sort_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((photo_path is null) = (photo_alt is null)),
  constraint connections_photo_size_with_path
    check ((photo_path is null) = (photo_width is null) and (photo_width is null) = (photo_height is null))
);

create index connections_tenant_order_idx
  on cwr.connections (tenant_id, is_visible, sort_order) where deleted_at is null;
create index connections_deleted_at_idx
  on cwr.connections (deleted_at) where deleted_at is not null;

create trigger connections_guard_deleted_at
  before insert or update of deleted_at on cwr.connections
  for each row execute function cwr.guard_deleted_at();
create trigger connections_set_updated_at
  before update on cwr.connections
  for each row execute function cwr.set_updated_at();
create trigger connections_record_audit
  after insert or update or delete on cwr.connections
  for each row execute function cwr.record_audit();

-- ---------------------------------------------------------------------------
-- Row Level Security: visitors read visible partners; owners and managers edit;
-- only owners permanently delete from the trash (same as team members).
-- ---------------------------------------------------------------------------

alter table cwr.connections enable row level security;

create policy "Visitors can read visible connections"
  on cwr.connections for select
  to anon
  using (is_visible and deleted_at is null);
create policy "Signed-in users read visible connections; editors read all"
  on cwr.connections for select
  to authenticated
  using (
    (is_visible and deleted_at is null)
    or tenant_id in (select cwr.editor_tenant_ids())
  );
create policy "Editors can add connections"
  on cwr.connections for insert
  to authenticated
  with check (tenant_id in (select cwr.editor_tenant_ids()));
create policy "Editors can change connections"
  on cwr.connections for update
  to authenticated
  using (tenant_id in (select cwr.editor_tenant_ids()))
  with check (tenant_id in (select cwr.editor_tenant_ids()));
create policy "Owners can permanently delete connections in trash"
  on cwr.connections for delete
  to authenticated
  using (deleted_at is not null and tenant_id in (select cwr.owner_tenant_ids()));

grant select on cwr.connections to anon;
grant select, insert, update, delete on cwr.connections to authenticated;
grant all on cwr.connections to service_role;

-- ---------------------------------------------------------------------------
-- Trash and its 30-day purge include connections.
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
  from cwr.connections where deleted_at is not null;

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
$$;

-- ---------------------------------------------------------------------------
-- Reordering: cwr.move_item also accepts connections (body otherwise unchanged).
-- ---------------------------------------------------------------------------

create or replace function cwr.move_item(p_table text, p_id uuid, p_direction text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_step integer := case p_direction when 'up' then -1 when 'down' then 1 end;
  v_scope_column text := case p_table when 'listing_photos' then 'listing_id' else 'tenant_id' end;
  v_scope_value uuid;
  v_tenant_id uuid;
  v_position integer;
  v_neighbor_id uuid;
begin
  if p_table not in ('listings', 'team_members', 'listing_photos', 'connections') then
    raise exception 'This list cannot be reordered' using errcode = 'invalid_parameter_value';
  end if;
  if v_step is null then
    raise exception 'Direction must be up or down' using errcode = 'invalid_parameter_value';
  end if;

  execute format('select %I, tenant_id from cwr.%I where id = $1 and deleted_at is null', v_scope_column, p_table)
    into v_scope_value, v_tenant_id using p_id;
  if v_scope_value is null then
    raise exception 'Item not found' using errcode = 'no_data_found';
  end if;
  if not cwr.is_service_context() and v_tenant_id not in (select cwr.editor_tenant_ids()) then
    raise exception 'Your role cannot reorder this list' using errcode = 'insufficient_privilege';
  end if;

  execute format('select 1 from cwr.%I where %I = $1 and deleted_at is null for update', p_table, v_scope_column)
    using v_scope_value;
  execute format(
    'update cwr.%1$I t set sort_order = o.position
     from (select id, row_number() over (order by sort_order, id)::integer as position
           from cwr.%1$I where %2$I = $1 and deleted_at is null) o
     where t.id = o.id and t.sort_order <> o.position',
    p_table, v_scope_column
  ) using v_scope_value;

  execute format('select sort_order from cwr.%I where id = $1', p_table) into v_position using p_id;
  execute format('select id from cwr.%I where %I = $1 and deleted_at is null and sort_order = $2', p_table, v_scope_column)
    into v_neighbor_id using v_scope_value, v_position + v_step;
  if v_neighbor_id is null then
    return;
  end if;

  execute format(
    'update cwr.%I set sort_order = case when id = $1 then $3 else $4 end where id in ($1, $2)',
    p_table
  ) using p_id, v_neighbor_id, v_position + v_step, v_position;
end;
$$;

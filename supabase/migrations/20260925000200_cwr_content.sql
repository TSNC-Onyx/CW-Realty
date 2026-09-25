-- Public site content: settings, featured listings, photos, team, redirects.
-- Slug rules and redirect behavior follow docs/reference/site/navigation-reconciliation.md.

create type cwr.listing_status as enum ('active', 'pending', 'sold');
create type cwr.publish_state as enum ('draft', 'live');
create type cwr.redirect_origin as enum ('legacy', 'slug_change', 'removal');

-- ---------------------------------------------------------------------------
-- Site settings: phone, email, contact names, footer — edited once, used everywhere
-- ---------------------------------------------------------------------------

create table cwr.site_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references cwr.tenants (id) on delete cascade,
  phone text not null check (phone ~ '^\+1[2-9][0-9]{9}$'),
  text_phone text check (text_phone ~ '^\+1[2-9][0-9]{9}$'),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_names text[] not null default '{}',
  footer_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Listings and photos
-- ---------------------------------------------------------------------------

create table cwr.listings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references cwr.tenants (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  street_address text not null check (length(trim(street_address)) > 0),
  city text not null check (length(trim(city)) > 0),
  state text not null default 'NC' check (state ~ '^[A-Z]{2}$'),
  postal_code text not null check (postal_code ~ '^[0-9]{5}$'),
  price_cents bigint not null check (price_cents > 0),
  status cwr.listing_status not null default 'active',
  publish_state cwr.publish_state not null default 'draft',
  description text not null check (length(trim(description)) > 0),
  bedrooms smallint check (bedrooms >= 0),
  bathrooms numeric(3, 1) check (bathrooms >= 0),
  square_feet integer check (square_feet > 0),
  sort_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);

create unique index listings_tenant_slug_key
  on cwr.listings (tenant_id, slug) where deleted_at is null;
create index listings_tenant_order_idx
  on cwr.listings (tenant_id, publish_state, sort_order) where deleted_at is null;
create index listings_deleted_at_idx
  on cwr.listings (deleted_at) where deleted_at is not null;

create table cwr.listing_photos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  listing_id uuid not null,
  storage_path text not null unique,
  alt_text text not null check (length(trim(alt_text)) between 1 and 250),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  sort_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (listing_id, tenant_id) references cwr.listings (id, tenant_id) on delete cascade
);

create index listing_photos_listing_idx on cwr.listing_photos (listing_id, tenant_id, sort_order);
create index listing_photos_deleted_at_idx
  on cwr.listing_photos (deleted_at) where deleted_at is not null;

-- ---------------------------------------------------------------------------
-- Team members. Hidden members keep their record (and page) for later reuse.
-- ---------------------------------------------------------------------------

create table cwr.team_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references cwr.tenants (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  full_name text not null check (length(trim(full_name)) > 0),
  job_title text not null default '',
  bio text not null default '',
  email text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone ~ '^\+1[2-9][0-9]{9}$'),
  photo_path text,
  photo_alt text check (photo_alt is null or length(trim(photo_alt)) between 1 and 250),
  is_visible boolean not null default true,
  sort_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((photo_path is null) = (photo_alt is null))
);

create unique index team_members_tenant_slug_key
  on cwr.team_members (tenant_id, slug) where deleted_at is null;
create index team_members_tenant_order_idx
  on cwr.team_members (tenant_id, is_visible, sort_order) where deleted_at is null;
create index team_members_deleted_at_idx
  on cwr.team_members (deleted_at) where deleted_at is not null;

-- ---------------------------------------------------------------------------
-- Redirects: stored already normalized (lowercase, no trailing slash); always one hop
-- ---------------------------------------------------------------------------

create table cwr.redirects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references cwr.tenants (id) on delete cascade,
  source_path text not null check (source_path ~ '^/[a-z0-9._~-]+(/[a-z0-9._~-]+)*$'),
  target_path text not null check (target_path ~ '^/([a-z0-9._~-]+(/[a-z0-9._~-]+)*)?$'),
  status_code smallint not null default 301 check (status_code in (301, 308)),
  origin cwr.redirect_origin not null,
  -- The listing or team member this redirect belongs to (null for legacy redirects),
  -- so restoring an item from trash can bring back all of its old URLs.
  record_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, source_path),
  check (source_path <> target_path)
);

create index redirects_tenant_target_idx on cwr.redirects (tenant_id, target_path);
create index redirects_record_idx on cwr.redirects (record_id) where record_id is not null;

-- Single hop, always: a new target that is itself redirected is followed to its
-- end, and redirects that pointed at this source are re-pointed past it.
create function cwr.collapse_redirect_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.target_path := coalesce(
    (select r.target_path from cwr.redirects r
     where r.tenant_id = new.tenant_id and r.source_path = new.target_path and r.id <> new.id),
    new.target_path
  );
  return new;
end;
$$;

create function cwr.repoint_redirects_to_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update cwr.redirects
  set target_path = new.target_path
  where tenant_id = new.tenant_id and target_path = new.source_path and id <> new.id;
  return null;
end;
$$;

create trigger redirects_collapse_target
  before insert or update of source_path, target_path on cwr.redirects
  for each row execute function cwr.collapse_redirect_target();
create trigger redirects_repoint_to_source
  after insert or update of source_path, target_path on cwr.redirects
  for each row execute function cwr.repoint_redirects_to_source();

-- A live page always wins over a redirect with the same path.
create function cwr.clear_redirect(p_tenant_id uuid, p_path text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from cwr.redirects where tenant_id = p_tenant_id and source_path = p_path;
$$;

-- Points a record's old URL at its new home. Callers pass named arguments.
create function cwr.upsert_redirect(
  p_tenant_id uuid,
  p_record_id uuid,
  p_source_path text,
  p_target_path text,
  p_origin cwr.redirect_origin
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform cwr.clear_redirect(p_tenant_id, p_target_path);
  insert into cwr.redirects (tenant_id, record_id, source_path, target_path, origin)
  values (p_tenant_id, p_record_id, p_source_path, p_target_path, p_origin)
  on conflict (tenant_id, source_path)
  do update set target_path = excluded.target_path, origin = excluded.origin, record_id = excluded.record_id;
end;
$$;

-- Trigger argument 0 is the public route prefix, e.g. '/listings' or '/team'.
-- Created: any redirect away from the new URL is removed.
-- Moved to trash: old URL -> index page (301).
-- Restored: the URL is freed and every old URL of the record points back at it.
-- Slug change: old URL -> new URL.
create function cwr.maintain_slug_redirects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text := tg_argv[0];
  v_new_path text := v_prefix || '/' || new.slug;
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is null then
      perform cwr.clear_redirect(new.tenant_id, v_new_path);
    end if;
    return new;
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    -- Claim legacy redirects that point at this page so a restore can bring them back.
    update cwr.redirects set record_id = new.id
    where tenant_id = new.tenant_id and target_path = v_prefix || '/' || old.slug and record_id is null;
    perform cwr.upsert_redirect(
      p_tenant_id => new.tenant_id, p_record_id => new.id,
      p_source_path => v_prefix || '/' || old.slug, p_target_path => v_prefix, p_origin => 'removal'
    );
    return new;
  end if;
  if new.deleted_at is null and old.deleted_at is not null then
    perform cwr.clear_redirect(new.tenant_id, v_new_path);
    update cwr.redirects set target_path = v_new_path
    where tenant_id = new.tenant_id and record_id = new.id;
    return new;
  end if;
  if new.deleted_at is null and new.slug <> old.slug then
    perform cwr.upsert_redirect(
      p_tenant_id => new.tenant_id, p_record_id => new.id,
      p_source_path => v_prefix || '/' || old.slug, p_target_path => v_new_path, p_origin => 'slug_change'
    );
  end if;
  return new;
end;
$$;

-- Trash dates cannot be forged: moving to trash always stamps "now", and an
-- item already in trash keeps its original date. Server jobs are trusted.
create function cwr.guard_deleted_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if cwr.is_service_context() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.deleted_at := case when new.deleted_at is null then null else now() end;
    return new;
  end if;
  if new.deleted_at is not distinct from old.deleted_at then
    return new;
  end if;
  if new.deleted_at is not null and old.deleted_at is not null then
    new.deleted_at := old.deleted_at;
    return new;
  end if;
  if new.deleted_at is not null then
    new.deleted_at := now();
  end if;
  return new;
end;
$$;

create trigger listings_guard_deleted_at
  before insert or update of deleted_at on cwr.listings
  for each row execute function cwr.guard_deleted_at();
create trigger listing_photos_guard_deleted_at
  before insert or update of deleted_at on cwr.listing_photos
  for each row execute function cwr.guard_deleted_at();
create trigger team_members_guard_deleted_at
  before insert or update of deleted_at on cwr.team_members
  for each row execute function cwr.guard_deleted_at();

-- A photo belongs to one listing for life; moving it could strip a live listing.
create function cwr.keep_photo_listing()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'A photo cannot be moved to another listing; upload it there instead'
    using errcode = 'check_violation';
end;
$$;

create trigger listing_photos_keep_listing
  before update of listing_id, tenant_id on cwr.listing_photos
  for each row
  when (new.listing_id <> old.listing_id or new.tenant_id <> old.tenant_id)
  execute function cwr.keep_photo_listing();

-- A hidden member's page temporarily redirects (302) to /team (navigation-reconciliation #6).
-- Visitors cannot read hidden rows, so the site asks this instead.
create function cwr.is_hidden_team_member(p_tenant_id uuid, p_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from cwr.team_members
    where tenant_id = p_tenant_id and slug = p_slug and not is_visible and deleted_at is null
  );
$$;

create trigger listings_maintain_slug_redirects
  after insert or update of slug, deleted_at on cwr.listings
  for each row execute function cwr.maintain_slug_redirects('/listings');

create trigger team_members_maintain_slug_redirects
  after insert or update of slug, deleted_at on cwr.team_members
  for each row execute function cwr.maintain_slug_redirects('/team');

create trigger site_settings_set_updated_at
  before update on cwr.site_settings
  for each row execute function cwr.set_updated_at();
create trigger listings_set_updated_at
  before update on cwr.listings
  for each row execute function cwr.set_updated_at();
create trigger listing_photos_set_updated_at
  before update on cwr.listing_photos
  for each row execute function cwr.set_updated_at();
create trigger team_members_set_updated_at
  before update on cwr.team_members
  for each row execute function cwr.set_updated_at();
create trigger redirects_set_updated_at
  before update on cwr.redirects
  for each row execute function cwr.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Public (anon) reads only published content. Owners and managers edit.
-- Soft delete (trash) and restore are updates; permanent removal is owner-only.
-- ---------------------------------------------------------------------------

alter table cwr.site_settings enable row level security;
alter table cwr.listings enable row level security;
alter table cwr.listing_photos enable row level security;
alter table cwr.team_members enable row level security;
alter table cwr.redirects enable row level security;

-- site_settings
create policy "Anyone can read site settings"
  on cwr.site_settings for select
  to anon, authenticated
  using (true);
create policy "Editors can add site settings"
  on cwr.site_settings for insert
  to authenticated
  with check (tenant_id in (select cwr.editor_tenant_ids()));
create policy "Editors can change site settings"
  on cwr.site_settings for update
  to authenticated
  using (tenant_id in (select cwr.editor_tenant_ids()))
  with check (tenant_id in (select cwr.editor_tenant_ids()));

-- listings
create policy "Visitors can read live listings"
  on cwr.listings for select
  to anon
  using (publish_state = 'live' and deleted_at is null);
create policy "Signed-in users read live listings; editors read all"
  on cwr.listings for select
  to authenticated
  using (
    (publish_state = 'live' and deleted_at is null)
    or tenant_id in (select cwr.editor_tenant_ids())
  );
create policy "Editors can add listings"
  on cwr.listings for insert
  to authenticated
  with check (tenant_id in (select cwr.editor_tenant_ids()));
create policy "Editors can change listings"
  on cwr.listings for update
  to authenticated
  using (tenant_id in (select cwr.editor_tenant_ids()))
  with check (tenant_id in (select cwr.editor_tenant_ids()));
create policy "Owners can permanently delete listings in trash"
  on cwr.listings for delete
  to authenticated
  using (deleted_at is not null and tenant_id in (select cwr.owner_tenant_ids()));

-- listing_photos (visibility follows the parent listing's own policies)
create policy "Visitors can read photos of live listings"
  on cwr.listing_photos for select
  to anon
  using (
    deleted_at is null
    and exists (select 1 from cwr.listings l where l.id = listing_id)
  );
create policy "Signed-in users read live photos; editors read all"
  on cwr.listing_photos for select
  to authenticated
  using (
    (deleted_at is null and exists (
      select 1 from cwr.listings l
      where l.id = listing_id and l.publish_state = 'live' and l.deleted_at is null
    ))
    or tenant_id in (select cwr.editor_tenant_ids())
  );
create policy "Editors can add listing photos"
  on cwr.listing_photos for insert
  to authenticated
  with check (tenant_id in (select cwr.editor_tenant_ids()));
create policy "Editors can change listing photos"
  on cwr.listing_photos for update
  to authenticated
  using (tenant_id in (select cwr.editor_tenant_ids()))
  with check (tenant_id in (select cwr.editor_tenant_ids()));
create policy "Owners can permanently delete listing photos in trash"
  on cwr.listing_photos for delete
  to authenticated
  using (deleted_at is not null and tenant_id in (select cwr.owner_tenant_ids()));

-- team_members
create policy "Visitors can read visible team members"
  on cwr.team_members for select
  to anon
  using (is_visible and deleted_at is null);
create policy "Signed-in users read visible members; editors read all"
  on cwr.team_members for select
  to authenticated
  using (
    (is_visible and deleted_at is null)
    or tenant_id in (select cwr.editor_tenant_ids())
  );
create policy "Editors can add team members"
  on cwr.team_members for insert
  to authenticated
  with check (tenant_id in (select cwr.editor_tenant_ids()));
create policy "Editors can change team members"
  on cwr.team_members for update
  to authenticated
  using (tenant_id in (select cwr.editor_tenant_ids()))
  with check (tenant_id in (select cwr.editor_tenant_ids()));
create policy "Owners can permanently delete team members in trash"
  on cwr.team_members for delete
  to authenticated
  using (deleted_at is not null and tenant_id in (select cwr.owner_tenant_ids()));

-- redirects
create policy "Anyone can read redirects"
  on cwr.redirects for select
  to anon, authenticated
  using (true);
create policy "Editors can add redirects"
  on cwr.redirects for insert
  to authenticated
  with check (tenant_id in (select cwr.editor_tenant_ids()));
create policy "Editors can change redirects"
  on cwr.redirects for update
  to authenticated
  using (tenant_id in (select cwr.editor_tenant_ids()))
  with check (tenant_id in (select cwr.editor_tenant_ids()));
create policy "Editors can remove redirects"
  on cwr.redirects for delete
  to authenticated
  using (tenant_id in (select cwr.editor_tenant_ids()));

grant select on cwr.site_settings, cwr.listings, cwr.listing_photos, cwr.team_members, cwr.redirects
  to anon;
grant select, insert, update on cwr.site_settings to authenticated;
grant select, insert, update, delete
  on cwr.listings, cwr.listing_photos, cwr.team_members, cwr.redirects
  to authenticated;
grant all on cwr.site_settings, cwr.listings, cwr.listing_photos, cwr.team_members, cwr.redirects
  to service_role;

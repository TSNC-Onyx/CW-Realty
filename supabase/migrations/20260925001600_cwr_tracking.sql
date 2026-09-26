-- Analytics, ads, and closed deals (Phase 6; Features §3, §4).
-- Expand-only: three new tables, and the trash view and purge job gain closed deals.

-- ---------------------------------------------------------------------------
-- Tracking settings: the Tag Manager container and Meta Pixel IDs. Both are public in
-- the page source once live, so anyone may read them; only owners may change them,
-- because a Tag Manager container can run any script on the site.
-- ---------------------------------------------------------------------------

create table cwr.tracking_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references cwr.tenants (id) on delete cascade,
  gtm_container_id text check (gtm_container_id ~ '^GTM-[A-Z0-9]{4,12}$'),
  meta_pixel_id text check (meta_pixel_id ~ '^[0-9]{10,20}$'),
  tags_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tracking_settings_set_updated_at
  before update on cwr.tracking_settings
  for each row execute function cwr.set_updated_at();
create trigger tracking_settings_record_audit
  after insert or update or delete on cwr.tracking_settings
  for each row execute function cwr.record_audit();

alter table cwr.tracking_settings enable row level security;

create policy "Anyone can read tracking settings"
  on cwr.tracking_settings for select
  to anon, authenticated
  using (true);
create policy "Owners can add tracking settings"
  on cwr.tracking_settings for insert
  to authenticated
  with check (tenant_id in (select cwr.owner_tenant_ids()));
create policy "Owners can change tracking settings"
  on cwr.tracking_settings for update
  to authenticated
  using (tenant_id in (select cwr.owner_tenant_ids()))
  with check (tenant_id in (select cwr.owner_tenant_ids()));

grant select on cwr.tracking_settings to anon, authenticated;
grant select, insert, update on cwr.tracking_settings to service_role;
grant insert, update on cwr.tracking_settings to authenticated;

-- Starts switched off: no IDs until the owner enters them.
insert into cwr.tracking_settings (tenant_id, gtm_container_id, meta_pixel_id, tags_reviewed_at)
select t.id, null, null, null
from cwr.tenants t
where t.slug = 'cwr'
on conflict (tenant_id) do nothing;

-- ---------------------------------------------------------------------------
-- Lead attribution: ad click IDs and campaign tags saved with a lead, only when the
-- visitor allowed advertising. Written by the server; owners and managers read it for
-- the closed-deal export. Removed with its conversation by the retention job.
-- ---------------------------------------------------------------------------

create table cwr.lead_attribution (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null unique,
  tenant_id uuid not null,
  gclid text check (gclid ~ '^[A-Za-z0-9_-]{10,200}$'),
  gbraid text check (gbraid ~ '^[A-Za-z0-9_-]{10,200}$'),
  wbraid text check (wbraid ~ '^[A-Za-z0-9_-]{10,200}$'),
  fbc text check (fbc ~ '^fb\.[0-9]\.[0-9]{10,13}\.[A-Za-z0-9_-]{10,255}$'),
  fbp text check (fbp ~ '^fb\.[0-9]\.[0-9]{10,13}\.[0-9]{5,20}$'),
  utm_source text check (length(utm_source) between 1 and 100),
  utm_medium text check (length(utm_medium) between 1 and 100),
  utm_campaign text check (length(utm_campaign) between 1 and 100),
  utm_term text check (length(utm_term) between 1 and 100),
  utm_content text check (length(utm_content) between 1 and 100),
  landing_path text check (landing_path ~ '^/[^?#]{0,255}$'),
  created_at timestamptz not null default now(),
  foreign key (thread_id, tenant_id) references cwr.inbox_threads (id, tenant_id) on delete cascade
);

create index lead_attribution_tenant_idx on cwr.lead_attribution (tenant_id);

-- Click IDs identify a visitor to the ad platforms, so the 3-year audit log keeps only
-- that a row changed, never the IDs themselves.
create trigger lead_attribution_record_audit
  after insert or update or delete on cwr.lead_attribution
  for each row execute function cwr.record_audit('gclid', 'gbraid', 'wbraid', 'fbc', 'fbp');

alter table cwr.lead_attribution enable row level security;

create policy "Editors read lead attribution"
  on cwr.lead_attribution for select
  to authenticated
  using (tenant_id in (select cwr.editor_tenant_ids()));

grant select on cwr.lead_attribution to authenticated;
grant select, insert on cwr.lead_attribution to service_role;

-- ---------------------------------------------------------------------------
-- Closed deals: recorded by owners and managers on an inbox conversation, exported for
-- Google Ads and Meta. One per conversation; deleting goes through the 30-day trash.
-- ---------------------------------------------------------------------------

create table cwr.closed_deals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  thread_id uuid not null unique,
  closed_on date not null check (closed_on >= date '2020-01-01'),
  value_cents bigint check (value_cents between 0 and 100000000000),
  recorded_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (thread_id, tenant_id) references cwr.inbox_threads (id, tenant_id) on delete cascade
);

create index closed_deals_tenant_idx on cwr.closed_deals (tenant_id, closed_on desc) where deleted_at is null;
create index closed_deals_recorded_by_idx on cwr.closed_deals (recorded_by) where recorded_by is not null;

create trigger closed_deals_set_updated_at
  before update on cwr.closed_deals
  for each row execute function cwr.set_updated_at();
create trigger closed_deals_record_audit
  after insert or update or delete on cwr.closed_deals
  for each row execute function cwr.record_audit();

alter table cwr.closed_deals enable row level security;

create policy "Editors read closed deals"
  on cwr.closed_deals for select
  to authenticated
  using (tenant_id in (select cwr.editor_tenant_ids()));
create policy "Editors record closed deals"
  on cwr.closed_deals for insert
  to authenticated
  with check (tenant_id in (select cwr.editor_tenant_ids()));
create policy "Editors change closed deals"
  on cwr.closed_deals for update
  to authenticated
  using (tenant_id in (select cwr.editor_tenant_ids()))
  with check (tenant_id in (select cwr.editor_tenant_ids()));
create policy "Owners delete trashed closed deals"
  on cwr.closed_deals for delete
  to authenticated
  using (tenant_id in (select cwr.owner_tenant_ids()) and deleted_at is not null);

grant select, insert, update, delete on cwr.closed_deals to authenticated;
grant select on cwr.closed_deals to service_role;

-- ---------------------------------------------------------------------------
-- Trash and its purge job include closed deals (labelled with the contact's name).
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
  where d.deleted_at is not null;

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
$$;

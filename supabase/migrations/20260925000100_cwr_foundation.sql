-- CWR foundation: isolated schema, tenants, memberships, role helpers, shared triggers.
-- The legacy `public` schema is never referenced by this build.

create schema if not exists cwr;
grant usage on schema cwr to anon, authenticated, service_role;

create type cwr.member_role as enum ('owner', 'manager', 'staff');

-- ---------------------------------------------------------------------------
-- Tenants and memberships
-- ---------------------------------------------------------------------------

create table cwr.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table cwr.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references cwr.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role cwr.member_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index memberships_user_id_idx on cwr.memberships (user_id);

-- ---------------------------------------------------------------------------
-- Role helpers. SECURITY DEFINER avoids RLS recursion on memberships.
-- Every admin role requires a multi-factor (aal2) session (Infra §2, Admin §7).
-- Policies call these inside `(select ...)` so they run once per statement.
-- ---------------------------------------------------------------------------

create function cwr.is_mfa_verified()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

create function cwr.tenant_ids_with_role(p_roles cwr.member_role[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.tenant_id
  from cwr.memberships m
  where m.user_id = (select auth.uid())
    and m.role = any (p_roles)
    and cwr.is_mfa_verified();
$$;

create function cwr.member_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cwr.tenant_ids_with_role(array['owner', 'manager', 'staff']::cwr.member_role[]);
$$;

create function cwr.editor_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cwr.tenant_ids_with_role(array['owner', 'manager']::cwr.member_role[]);
$$;

create function cwr.owner_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cwr.tenant_ids_with_role(array['owner']::cwr.member_role[]);
$$;

-- True for server-side work (service role key, scheduled jobs, migrations).
create function cwr.is_service_context()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('service_role', 'postgres', 'supabase_admin');
$$;

-- ---------------------------------------------------------------------------
-- Shared triggers
-- ---------------------------------------------------------------------------

create function cwr.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- A tenant must always keep at least one owner. Locking the tenant row
-- serializes concurrent demotions so two owners cannot remove each other.
create function cwr.guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role <> 'owner' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role = 'owner' and new.tenant_id = old.tenant_id then
    return new;
  end if;

  perform 1 from cwr.tenants where id = old.tenant_id for update;
  if exists (
    select 1 from cwr.memberships
    where tenant_id = old.tenant_id and role = 'owner' and id <> old.id
  ) then
    return coalesce(new, old);
  end if;

  raise exception 'A tenant must keep at least one owner'
    using errcode = 'check_violation';
end;
$$;

create trigger tenants_set_updated_at
  before update on cwr.tenants
  for each row execute function cwr.set_updated_at();

create trigger memberships_set_updated_at
  before update on cwr.memberships
  for each row execute function cwr.set_updated_at();

create trigger memberships_guard_last_owner
  before update or delete on cwr.memberships
  for each row execute function cwr.guard_last_owner();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table cwr.tenants enable row level security;
alter table cwr.memberships enable row level security;

create policy "Anyone can read tenant names"
  on cwr.tenants for select
  to anon, authenticated
  using (true);

create policy "Members can read memberships in their tenant"
  on cwr.memberships for select
  to authenticated
  using (tenant_id in (select cwr.member_tenant_ids()));

create policy "Owners can add memberships"
  on cwr.memberships for insert
  to authenticated
  with check (tenant_id in (select cwr.owner_tenant_ids()));

create policy "Owners can change memberships"
  on cwr.memberships for update
  to authenticated
  using (tenant_id in (select cwr.owner_tenant_ids()))
  with check (tenant_id in (select cwr.owner_tenant_ids()));

create policy "Owners can remove memberships"
  on cwr.memberships for delete
  to authenticated
  using (tenant_id in (select cwr.owner_tenant_ids()));

grant select on cwr.tenants to anon, authenticated;
grant select, insert, update, delete on cwr.memberships to authenticated;
grant all on cwr.tenants, cwr.memberships to service_role;

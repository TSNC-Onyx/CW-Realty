-- Workflow engine: cwr.transition() is the only way to change any status column.
-- Every allowed move (from -> to, and which roles may make it) is a row in
-- cwr.workflow_transitions; every transition is written to the audit log.

create table cwr.workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references cwr.tenants (id) on delete cascade,
  key text not null check (key ~ '^[a-z_]+$'),
  table_name text not null check (table_name in ('listings', 'inbox_threads', 'chat_policies')),
  state_column text not null check (state_column in ('status', 'publish_state')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, key),
  unique (id, tenant_id)
);

create table cwr.workflow_transitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  workflow_id uuid not null,
  from_state text not null,
  to_state text not null,
  allowed_roles cwr.member_role[] not null check (cardinality(allowed_roles) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_id, from_state, to_state),
  check (from_state <> to_state),
  foreign key (workflow_id, tenant_id) references cwr.workflows (id, tenant_id) on delete cascade
);

create index workflow_transitions_workflow_idx on cwr.workflow_transitions (workflow_id, tenant_id);

create trigger workflows_set_updated_at
  before update on cwr.workflows
  for each row execute function cwr.set_updated_at();
create trigger workflow_transitions_set_updated_at
  before update on cwr.workflow_transitions
  for each row execute function cwr.set_updated_at();

-- ---------------------------------------------------------------------------
-- Default workflow definitions, installed for every new tenant
-- ---------------------------------------------------------------------------

create function cwr.install_default_workflows(p_tenant_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  with definitions (key, table_name, state_column) as (
    values
      ('listing_status', 'listings', 'status'),
      ('listing_publish', 'listings', 'publish_state'),
      ('inbox_status', 'inbox_threads', 'status'),
      ('chat_policy_status', 'chat_policies', 'status')
  ),
  created as (
    insert into cwr.workflows (tenant_id, key, table_name, state_column)
    select p_tenant_id, d.key, d.table_name, d.state_column from definitions d
    on conflict (tenant_id, key) do nothing
    returning id, key
  ),
  moves (key, from_state, to_state, allowed_roles) as (
    values
      ('listing_status', 'active', 'pending', '{owner,manager}'),
      ('listing_status', 'pending', 'active', '{owner,manager}'),
      ('listing_status', 'active', 'sold', '{owner,manager}'),
      ('listing_status', 'pending', 'sold', '{owner,manager}'),
      ('listing_status', 'sold', 'active', '{owner,manager}'),
      ('listing_publish', 'draft', 'live', '{owner,manager}'),
      ('listing_publish', 'live', 'draft', '{owner,manager}'),
      ('inbox_status', 'new', 'assigned', '{owner,manager}'),
      ('inbox_status', 'new', 'replied', '{owner,manager}'),
      ('inbox_status', 'new', 'closed', '{owner,manager}'),
      ('inbox_status', 'assigned', 'replied', '{owner,manager,staff}'),
      ('inbox_status', 'assigned', 'closed', '{owner,manager,staff}'),
      ('inbox_status', 'replied', 'assigned', '{owner,manager,staff}'),
      ('inbox_status', 'replied', 'closed', '{owner,manager,staff}'),
      ('inbox_status', 'closed', 'assigned', '{owner,manager}'),
      ('chat_policy_status', 'draft', 'published', '{owner}'),
      ('chat_policy_status', 'published', 'archived', '{owner}')
  )
  insert into cwr.workflow_transitions (tenant_id, workflow_id, from_state, to_state, allowed_roles)
  select p_tenant_id, c.id, m.from_state, m.to_state, m.allowed_roles::cwr.member_role[]
  from moves m
  join created c on c.key = m.key;
$$;

create function cwr.install_workflows_for_new_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform cwr.install_default_workflows(new.id);
  return new;
end;
$$;

create trigger tenants_install_workflows
  after insert on cwr.tenants
  for each row execute function cwr.install_workflows_for_new_tenant();

-- ---------------------------------------------------------------------------
-- The engine. SECURITY INVOKER: the caller's own row-level access applies, so
-- staff can only move threads assigned to them. The row is locked while it moves.
-- ---------------------------------------------------------------------------

create function cwr.get_workflow_step(
  p_workflow_key text,
  p_tenant_id uuid,
  p_from_state text,
  p_to_state text
)
returns cwr.workflow_transitions
language sql
stable
set search_path = ''
as $$
  select wt.*
  from cwr.workflow_transitions wt
  join cwr.workflows w on w.id = wt.workflow_id
  where w.key = p_workflow_key
    and w.tenant_id = p_tenant_id
    and wt.from_state = p_from_state
    and wt.to_state = p_to_state;
$$;

create function cwr.is_allowed_to_make(p_step cwr.workflow_transitions)
returns boolean
language sql
stable
set search_path = ''
as $$
  select cwr.is_service_context()
    or p_step.tenant_id in (select cwr.tenant_ids_with_role(p_step.allowed_roles));
$$;

create function cwr.transition(p_workflow_key text, p_record_id uuid, p_to_state text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workflow record;
  v_tenant_id uuid;
  v_from_state text;
  v_step cwr.workflow_transitions;
begin
  select distinct w.table_name, w.state_column into v_workflow
  from cwr.workflows w
  where w.key = p_workflow_key;
  if not found then
    raise exception 'Unknown workflow %', p_workflow_key using errcode = 'invalid_parameter_value';
  end if;

  execute format(
    'select tenant_id, %I::text from cwr.%I where id = $1 for update',
    v_workflow.state_column, v_workflow.table_name
  ) into v_tenant_id, v_from_state using p_record_id;
  if v_tenant_id is null then
    raise exception 'Record not found' using errcode = 'no_data_found';
  end if;

  v_step := cwr.get_workflow_step(p_workflow_key, v_tenant_id, v_from_state, p_to_state);
  if v_step.id is null then
    raise exception 'Cannot move % from % to %', p_workflow_key, v_from_state, p_to_state
      using errcode = 'check_violation';
  end if;
  if not cwr.is_allowed_to_make(v_step) then
    raise exception 'Your role cannot make this change' using errcode = 'insufficient_privilege';
  end if;

  perform set_config('cwr.in_transition', 'on', true);
  -- %L lets Postgres cast the (already validated) state name to the column's enum type.
  execute format(
    'update cwr.%I set %I = %L where id = $1',
    v_workflow.table_name, v_workflow.state_column, p_to_state
  ) using p_record_id;
  perform set_config('cwr.in_transition', 'off', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Guards: status columns cannot be set directly, and new rows start in the
-- first state. Trigger args: 0 = state column, 1 = required starting state.
-- ---------------------------------------------------------------------------

create function cwr.guard_workflow_state()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_column text := tg_argv[0];
  v_new_state text := to_jsonb(new) ->> v_column;
begin
  if current_setting('cwr.in_transition', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' and v_new_state = tg_argv[1] then
    return new;
  end if;
  if tg_op = 'UPDATE' and v_new_state = to_jsonb(old) ->> v_column then
    return new;
  end if;
  raise exception 'Status changes must go through cwr.transition()'
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger listings_guard_status
  before insert or update on cwr.listings
  for each row execute function cwr.guard_workflow_state('status', 'active');
create trigger listings_guard_publish_state
  before insert or update on cwr.listings
  for each row execute function cwr.guard_workflow_state('publish_state', 'draft');
create trigger inbox_threads_guard_status
  before insert or update on cwr.inbox_threads
  for each row execute function cwr.guard_workflow_state('status', 'new');
create trigger chat_policies_guard_status
  before insert or update on cwr.chat_policies
  for each row execute function cwr.guard_workflow_state('status', 'draft');

-- ---------------------------------------------------------------------------
-- Business rules checked when a status changes
-- ---------------------------------------------------------------------------

-- A listing is live only with at least one photo (Admin §2): checked when it is
-- published and when a live listing is restored from the trash.
create function cwr.require_listing_photo_to_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from cwr.listing_photos p
    where p.listing_id = new.id and p.deleted_at is null
  ) then
    return new;
  end if;
  raise exception 'Add at least one photo before publishing this listing'
    using errcode = 'check_violation';
end;
$$;

create trigger listings_require_photo_to_publish
  before update of publish_state, deleted_at on cwr.listings
  for each row
  when (
    new.publish_state = 'live' and new.deleted_at is null
    and (old.publish_state <> 'live' or old.deleted_at is not null)
  )
  execute function cwr.require_listing_photo_to_publish();

-- A live listing must keep at least one photo. The listing row is locked so two
-- photos removed at the same moment cannot both pass the check.
create function cwr.keep_photo_on_live_listing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from cwr.listings where id = new.listing_id for update;
  if not exists (
    select 1 from cwr.listings l
    where l.id = new.listing_id and l.publish_state = 'live' and l.deleted_at is null
  ) then
    return new;
  end if;
  if exists (
    select 1 from cwr.listing_photos p
    where p.listing_id = new.listing_id and p.deleted_at is null and p.id <> new.id
  ) then
    return new;
  end if;
  raise exception 'A live listing needs at least one photo: add another or unpublish it first'
    using errcode = 'check_violation';
end;
$$;

create trigger listing_photos_keep_one_on_live_listing
  before update of deleted_at on cwr.listing_photos
  for each row
  when (new.deleted_at is not null and old.deleted_at is null)
  execute function cwr.keep_photo_on_live_listing();

-- A policy version publishes only after a passing test run (Admin §6), newer than
-- both its own last edit and the last change to the preset questions; the
-- previously published version is archived in the same step.
create function cwr.publish_chat_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from cwr.chat_policy_test_runs r
    where r.policy_id = new.id and r.is_passed
      and r.ran_at >= old.updated_at
      and r.ran_at >= coalesce(
        (select max(t.updated_at) from cwr.chat_policy_tests t where t.tenant_id = new.tenant_id),
        old.updated_at
      )
  ) then
    raise exception 'Run the policy tests and pass them before publishing'
      using errcode = 'check_violation';
  end if;

  update cwr.chat_policies
  set status = 'archived'
  where tenant_id = new.tenant_id and status = 'published' and id <> new.id;
  new.published_at := now();
  return new;
end;
$$;

create trigger chat_policies_publish
  before update of status on cwr.chat_policies
  for each row
  when (new.status = 'published' and old.status <> 'published')
  execute function cwr.publish_chat_policy();

-- ---------------------------------------------------------------------------
-- Row Level Security: definitions are readable by members, changed only by migrations.
-- ---------------------------------------------------------------------------

alter table cwr.workflows enable row level security;
alter table cwr.workflow_transitions enable row level security;

create policy "Members read workflows"
  on cwr.workflows for select
  to authenticated
  using (tenant_id in (select cwr.member_tenant_ids()));
create policy "Members read workflow transitions"
  on cwr.workflow_transitions for select
  to authenticated
  using (tenant_id in (select cwr.member_tenant_ids()));

grant select on cwr.workflows, cwr.workflow_transitions to authenticated;
grant all on cwr.workflows, cwr.workflow_transitions to service_role;

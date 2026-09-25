-- Chatbot: versioned policy file (owner-only), preset test questions, test runs
-- that gate publishing, and logged chats for weekly review.
-- The policy lives only in the database — never in this public repository.

create type cwr.chat_policy_status as enum ('draft', 'published', 'archived');
create type cwr.chat_test_outcome as enum ('answer', 'handoff');
create type cwr.chat_message_role as enum ('visitor', 'assistant');

create table cwr.chat_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references cwr.tenants (id) on delete cascade,
  version integer not null check (version > 0),
  body text not null check (length(trim(body)) between 1 and 200000),
  status cwr.chat_policy_status not null default 'draft',
  published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, version),
  unique (id, tenant_id)
);

create unique index chat_policies_one_published_key
  on cwr.chat_policies (tenant_id) where status = 'published';
create index chat_policies_created_by_idx on cwr.chat_policies (created_by);

create table cwr.chat_policy_tests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references cwr.tenants (id) on delete cascade,
  question text not null check (length(trim(question)) between 1 and 2000),
  expected_outcome cwr.chat_test_outcome not null,
  expected_section text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chat_policy_tests_tenant_idx on cwr.chat_policy_tests (tenant_id) where is_active;

-- Written only by the server-side test runner, so a pass cannot be faked from the browser.
create table cwr.chat_policy_test_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  policy_id uuid not null,
  is_passed boolean not null,
  results jsonb not null default '[]'::jsonb,
  ran_by uuid references auth.users (id) on delete set null,
  ran_at timestamptz not null default now(),
  foreign key (policy_id, tenant_id) references cwr.chat_policies (id, tenant_id) on delete cascade
);

create index chat_policy_test_runs_policy_idx on cwr.chat_policy_test_runs (policy_id, tenant_id, ran_at desc);
create index chat_policy_test_runs_ran_by_idx on cwr.chat_policy_test_runs (ran_by);

create table cwr.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references cwr.tenants (id) on delete cascade,
  policy_id uuid,
  inbox_thread_id uuid,
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (policy_id, tenant_id)
    references cwr.chat_policies (id, tenant_id) on delete set null (policy_id),
  foreign key (inbox_thread_id, tenant_id)
    references cwr.inbox_threads (id, tenant_id) on delete set null (inbox_thread_id)
);

create index chat_sessions_tenant_started_idx on cwr.chat_sessions (tenant_id, started_at desc);
create index chat_sessions_policy_idx on cwr.chat_sessions (policy_id, tenant_id);
create index chat_sessions_thread_idx on cwr.chat_sessions (inbox_thread_id, tenant_id);
create index chat_sessions_last_message_idx on cwr.chat_sessions (last_message_at);

create table cwr.chat_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  session_id uuid not null,
  role cwr.chat_message_role not null,
  body text not null check (length(body) between 1 and 20000),
  cited_sections text[] not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (session_id, tenant_id) references cwr.chat_sessions (id, tenant_id) on delete cascade
);

create index chat_messages_session_idx on cwr.chat_messages (session_id, tenant_id, created_at);

-- New policy versions are numbered automatically: 1, 2, 3 ...
create function cwr.assign_chat_policy_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from cwr.tenants where id = new.tenant_id for update;
  select coalesce(max(version), 0) + 1 into new.version
  from cwr.chat_policies
  where tenant_id = new.tenant_id;
  return new;
end;
$$;

-- Once a version leaves draft its text is frozen; restoring an old version
-- creates a new draft from its text, so history is never rewritten.
create function cwr.freeze_chat_policy_body()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'draft' and new.body is distinct from old.body then
    raise exception 'Only draft policy versions can be edited'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger chat_policies_assign_version
  before insert on cwr.chat_policies
  for each row execute function cwr.assign_chat_policy_version();
create trigger chat_policies_freeze_body
  before update of body on cwr.chat_policies
  for each row execute function cwr.freeze_chat_policy_body();
create trigger chat_policies_set_updated_at
  before update on cwr.chat_policies
  for each row execute function cwr.set_updated_at();
create trigger chat_policy_tests_set_updated_at
  before update on cwr.chat_policy_tests
  for each row execute function cwr.set_updated_at();
create trigger chat_sessions_set_updated_at
  before update on cwr.chat_sessions
  for each row execute function cwr.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security. Only owners touch the policy and its tests.
-- Owners and managers read logged chats for the weekly review.
-- Sessions, messages, and test runs are written by the server only.
-- ---------------------------------------------------------------------------

alter table cwr.chat_policies enable row level security;
alter table cwr.chat_policy_tests enable row level security;
alter table cwr.chat_policy_test_runs enable row level security;
alter table cwr.chat_sessions enable row level security;
alter table cwr.chat_messages enable row level security;

create policy "Owners read policy versions"
  on cwr.chat_policies for select
  to authenticated
  using (tenant_id in (select cwr.owner_tenant_ids()));
create policy "Owners add policy versions"
  on cwr.chat_policies for insert
  to authenticated
  with check (tenant_id in (select cwr.owner_tenant_ids()));
create policy "Owners edit policy versions"
  on cwr.chat_policies for update
  to authenticated
  using (tenant_id in (select cwr.owner_tenant_ids()))
  with check (tenant_id in (select cwr.owner_tenant_ids()));

create policy "Owners read policy tests"
  on cwr.chat_policy_tests for select
  to authenticated
  using (tenant_id in (select cwr.owner_tenant_ids()));
create policy "Owners add policy tests"
  on cwr.chat_policy_tests for insert
  to authenticated
  with check (tenant_id in (select cwr.owner_tenant_ids()));
create policy "Owners edit policy tests"
  on cwr.chat_policy_tests for update
  to authenticated
  using (tenant_id in (select cwr.owner_tenant_ids()))
  with check (tenant_id in (select cwr.owner_tenant_ids()));
create policy "Owners remove policy tests"
  on cwr.chat_policy_tests for delete
  to authenticated
  using (tenant_id in (select cwr.owner_tenant_ids()));

create policy "Owners read policy test runs"
  on cwr.chat_policy_test_runs for select
  to authenticated
  using (tenant_id in (select cwr.owner_tenant_ids()));

create policy "Editors read chat sessions"
  on cwr.chat_sessions for select
  to authenticated
  using (tenant_id in (select cwr.editor_tenant_ids()));
create policy "Editors read chat messages"
  on cwr.chat_messages for select
  to authenticated
  using (tenant_id in (select cwr.editor_tenant_ids()));

grant select, insert, update on cwr.chat_policies to authenticated;
grant select, insert, update, delete on cwr.chat_policy_tests to authenticated;
grant select on cwr.chat_policy_test_runs, cwr.chat_sessions, cwr.chat_messages to authenticated;
grant all on cwr.chat_policies, cwr.chat_policy_tests, cwr.chat_policy_test_runs,
  cwr.chat_sessions, cwr.chat_messages to service_role;

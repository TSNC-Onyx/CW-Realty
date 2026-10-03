-- Chat policy tests in batches (docs/cwr-chat-policy-test-batches-plan.md, Part A).
-- Expand-only: two new service-only tables and two catalog rows.
--
-- One test run used to ask every question in a single request, which went past the
-- Cloudflare Workers Free limit of 50 outside calls per request. A run is now a job:
-- the browser asks for one batch of questions per request, each finished batch is saved
-- as a part, and the run is recorded only when every part is in.

-- ---------------------------------------------------------------------------
-- A job fixes exactly which questions the run tests, and which saved draft and
-- question set it started from, so a run can never test a different list than it saves.
-- ---------------------------------------------------------------------------

create table cwr.chat_policy_test_jobs (
  run_key uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references cwr.tenants (id) on delete cascade,
  policy_id uuid not null,
  policy_updated_at timestamptz not null,
  tests_updated_at timestamptz,
  test_ids uuid[] not null,
  batch_size integer not null check (batch_size > 0),
  batch_count integer not null check (batch_count > 0),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  foreign key (policy_id, tenant_id) references cwr.chat_policies (id, tenant_id) on delete cascade
);

create index chat_policy_test_jobs_created_by_idx on cwr.chat_policy_test_jobs (created_by);
create index chat_policy_test_jobs_policy_idx on cwr.chat_policy_test_jobs (policy_id, tenant_id);
create index chat_policy_test_jobs_created_at_idx on cwr.chat_policy_test_jobs (created_at);

-- ---------------------------------------------------------------------------
-- One row per finished batch. Insert-only: a batch that runs twice is refused by the
-- primary key, so a result can never be swapped for a luckier one.
-- ---------------------------------------------------------------------------

create table cwr.chat_policy_test_parts (
  run_key uuid not null references cwr.chat_policy_test_jobs (run_key) on delete cascade,
  batch_index integer not null check (batch_index >= 0),
  results jsonb not null check (jsonb_typeof(results) = 'array'),
  created_at timestamptz not null default now(),
  primary key (run_key, batch_index)
);

-- Only the server (service role) touches either table; nobody signed in reads them.
alter table cwr.chat_policy_test_jobs enable row level security;
alter table cwr.chat_policy_test_parts enable row level security;

revoke all on cwr.chat_policy_test_jobs from anon, authenticated, service_role;
revoke all on cwr.chat_policy_test_parts from anon, authenticated, service_role;
grant select, insert, delete on cwr.chat_policy_test_jobs to service_role;
grant select, insert, delete on cwr.chat_policy_test_parts to service_role;

-- ---------------------------------------------------------------------------
-- Problem catalog: starting and finishing a run are their own actions
-- (chat_policy.run_tests now names one batch).
-- ---------------------------------------------------------------------------

insert into cwr.problem_catalog (action, area, label, section_label, spike_codes) values
  ('chat_policy.start_tests', 'chat_policy', 'Start the policy tests', 'Chat policy', '{}'),
  ('chat_policy.finish_tests', 'chat_policy', 'Save the policy test results', 'Chat policy', '{}');

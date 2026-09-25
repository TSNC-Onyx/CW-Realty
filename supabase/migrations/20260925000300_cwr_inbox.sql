-- Inbox (contact form, chat handoffs, TouchUp booking requests) and alert recipients.
-- Visitors never write here directly: intake runs server-side after bot checks.

create type cwr.inbox_source as enum ('contact', 'chat_handoff', 'booking');
create type cwr.inbox_status as enum ('new', 'assigned', 'replied', 'closed');
create type cwr.inbox_message_kind as enum ('inbound', 'reply', 'internal_note');

create table cwr.inbox_threads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references cwr.tenants (id) on delete cascade,
  source cwr.inbox_source not null,
  status cwr.inbox_status not null default 'new',
  assignee_id uuid,
  contact_name text not null check (length(trim(contact_name)) between 1 and 200),
  contact_email text check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone text check (contact_phone ~ '^\+1[2-9][0-9]{9}$'),
  subject text not null default '' check (length(subject) <= 300),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  check (contact_email is not null or contact_phone is not null),
  -- An assigned thread always has someone on it. Removing a user who still holds
  -- assigned threads is therefore refused until those threads are reassigned.
  check (status <> 'assigned' or assignee_id is not null),
  -- The assignee must be a member of the same tenant; removing a member unassigns
  -- their replied and closed threads.
  foreign key (tenant_id, assignee_id)
    references cwr.memberships (tenant_id, user_id) on delete set null (assignee_id)
);

create index inbox_threads_tenant_status_idx on cwr.inbox_threads (tenant_id, status, created_at desc);
create index inbox_threads_assignee_idx on cwr.inbox_threads (tenant_id, assignee_id)
  where assignee_id is not null;
create index inbox_threads_closed_at_idx on cwr.inbox_threads (closed_at) where closed_at is not null;

create table cwr.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  thread_id uuid not null,
  kind cwr.inbox_message_kind not null,
  body text not null check (length(trim(body)) between 1 and 20000),
  author_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (thread_id, tenant_id) references cwr.inbox_threads (id, tenant_id) on delete cascade,
  check ((kind = 'inbound') = (author_id is null))
);

create index inbox_messages_thread_idx on cwr.inbox_messages (thread_id, tenant_id, created_at);
create index inbox_messages_author_idx on cwr.inbox_messages (author_id) where author_id is not null;

create table cwr.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references cwr.tenants (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  alert_sources cwr.inbox_source[] not null default array['contact', 'chat_handoff', 'booking']::cwr.inbox_source[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index notification_recipients_tenant_email_key
  on cwr.notification_recipients (tenant_id, lower(email));

-- closed_at drives the one-year retention clock for closed threads, so users can
-- never set it: it is stamped when a thread closes and kept while it stays closed.
create function cwr.stamp_inbox_closed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'closed' then
    new.closed_at := null;
    return new;
  end if;
  if cwr.is_service_context() and new.closed_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'closed' then
    new.closed_at := old.closed_at;
    return new;
  end if;
  new.closed_at := now();
  return new;
end;
$$;

create trigger inbox_threads_stamp_closed_at
  before insert or update on cwr.inbox_threads
  for each row execute function cwr.stamp_inbox_closed_at();

create trigger inbox_threads_set_updated_at
  before update on cwr.inbox_threads
  for each row execute function cwr.set_updated_at();
create trigger notification_recipients_set_updated_at
  before update on cwr.notification_recipients
  for each row execute function cwr.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security. Owners and managers see every thread; staff see only
-- threads assigned to them. Messages follow their thread's visibility.
-- Threads are closed, never deleted by users; the retention job removes them
-- one year after closing.
-- ---------------------------------------------------------------------------

alter table cwr.inbox_threads enable row level security;
alter table cwr.inbox_messages enable row level security;
alter table cwr.notification_recipients enable row level security;

create policy "Editors see all threads; staff see their assigned threads"
  on cwr.inbox_threads for select
  to authenticated
  using (
    tenant_id in (select cwr.editor_tenant_ids())
    or (assignee_id = (select auth.uid()) and tenant_id in (select cwr.member_tenant_ids()))
  );
create policy "Editors change any thread; staff change their assigned threads"
  on cwr.inbox_threads for update
  to authenticated
  using (
    tenant_id in (select cwr.editor_tenant_ids())
    or (assignee_id = (select auth.uid()) and tenant_id in (select cwr.member_tenant_ids()))
  )
  with check (
    tenant_id in (select cwr.editor_tenant_ids())
    or (assignee_id = (select auth.uid()) and tenant_id in (select cwr.member_tenant_ids()))
  );
create policy "Members read messages of threads they can see"
  on cwr.inbox_messages for select
  to authenticated
  using (exists (select 1 from cwr.inbox_threads t where t.id = thread_id));
create policy "Members add replies and notes to threads they can see"
  on cwr.inbox_messages for insert
  to authenticated
  with check (
    kind in ('reply', 'internal_note')
    and author_id = (select auth.uid())
    and exists (select 1 from cwr.inbox_threads t where t.id = thread_id and t.tenant_id = inbox_messages.tenant_id)
  );

create policy "Editors read alert recipients"
  on cwr.notification_recipients for select
  to authenticated
  using (tenant_id in (select cwr.editor_tenant_ids()));
create policy "Editors add alert recipients"
  on cwr.notification_recipients for insert
  to authenticated
  with check (tenant_id in (select cwr.editor_tenant_ids()));
create policy "Editors change alert recipients"
  on cwr.notification_recipients for update
  to authenticated
  using (tenant_id in (select cwr.editor_tenant_ids()))
  with check (tenant_id in (select cwr.editor_tenant_ids()));
create policy "Editors remove alert recipients"
  on cwr.notification_recipients for delete
  to authenticated
  using (tenant_id in (select cwr.editor_tenant_ids()));

grant select, update on cwr.inbox_threads to authenticated;
grant select, insert on cwr.inbox_messages to authenticated;
grant select, insert, update, delete on cwr.notification_recipients to authenticated;
grant all on cwr.inbox_threads, cwr.inbox_messages, cwr.notification_recipients to service_role;

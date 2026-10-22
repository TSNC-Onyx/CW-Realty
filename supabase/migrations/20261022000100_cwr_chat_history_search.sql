-- Chat history search, sort, and activity figures (owner request 2026-10-22).
-- Expand-only: four new chat_sessions columns kept by a trigger, one read-only function,
-- and indexes for searching and sorting (Infra §5: indexed, under 300ms).

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Each chat stores what its list row shows, so the list can sort by it with an index.
-- question_count counts every visitor message: typed questions and topic-button taps,
-- as the list's "N questions" line always has. Messages are only ever inserted, or
-- removed with their chat, so the counts never need to go down.
-- ---------------------------------------------------------------------------

alter table cwr.chat_sessions
  add column question_count integer not null default 0 check (question_count >= 0),
  add column handoff_count integer not null default 0 check (handoff_count >= 0),
  add column first_question text check (length(first_question) <= 300),
  add column first_question_sort text generated always as (lower(first_question)) stored;

comment on column cwr.chat_sessions.first_question is 'The first visitor message, cut to 300 characters, for the Chat history list.';
comment on column cwr.chat_sessions.first_question_sort is 'first_question in lower case, so the A-Z sort ignores capitals.';

update cwr.chat_sessions s
set question_count = a.questions,
    handoff_count = a.handoffs,
    first_question = a.first_question
from (
  select
    m.session_id,
    count(*) filter (where m.role = 'visitor')::int as questions,
    count(*) filter (where m.outcome = 'handoff')::int as handoffs,
    left((array_agg(m.body order by m.created_at, m.role) filter (where m.role = 'visitor'))[1], 300) as first_question
  from cwr.chat_messages m
  group by m.session_id
) a
where s.id = a.session_id;

-- One update per insert statement (not per row): each exchange is a single two-row insert,
-- and every chat_sessions update also writes an audit row.
create function cwr.count_chat_messages()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update cwr.chat_sessions s
  set question_count = s.question_count + n.questions,
      handoff_count = s.handoff_count + n.handoffs,
      first_question = coalesce(s.first_question, n.first_question)
  from (
    select
      r.session_id,
      count(*) filter (where r.role = 'visitor')::int as questions,
      count(*) filter (where r.outcome = 'handoff')::int as handoffs,
      left((array_agg(r.body order by r.created_at, r.role) filter (where r.role = 'visitor'))[1], 300) as first_question
    from new_rows r
    group by r.session_id
  ) n
  where s.id = n.session_id
    and (n.questions > 0 or n.handoffs > 0);
  return null;
end;
$$;

revoke execute on function cwr.count_chat_messages() from public, anon, authenticated;

create trigger chat_messages_count
  after insert on cwr.chat_messages
  referencing new table as new_rows
  for each statement execute function cwr.count_chat_messages();

-- The audit log already leaves out message text (chat_messages.body); the first question
-- is a copy of it, so it is left out too.
drop trigger chat_sessions_record_audit on cwr.chat_sessions;
create trigger chat_sessions_record_audit
  after insert or update or delete on cwr.chat_sessions
  for each row execute function cwr.record_audit('first_question', 'first_question_sort');

-- ---------------------------------------------------------------------------
-- Activity figures for one span. Runs with the caller's rights, so Row Level Security
-- still limits it to owners and managers. Answered rate uses typed replies only: topic
-- buttons always "answer" with their fixed text and would push the rate toward 100%.
-- ---------------------------------------------------------------------------

create function cwr.chat_activity(p_tenant_id uuid, p_from timestamptz, p_to timestamptz)
returns table (chats integer, sent_to_inbox integer, typed_replies integer, typed_answers integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select count(*)::int from cwr.chat_sessions s
     where s.tenant_id = p_tenant_id and s.started_at >= p_from and s.started_at < p_to),
    (select count(*)::int from cwr.chat_sessions s
     where s.tenant_id = p_tenant_id and s.started_at >= p_from and s.started_at < p_to
       and s.inbox_thread_id is not null),
    (select count(*)::int from cwr.chat_messages m
     where m.tenant_id = p_tenant_id and m.role = 'assistant' and m.source = 'typed'
       and m.created_at >= p_from and m.created_at < p_to),
    (select count(*)::int from cwr.chat_messages m
     where m.tenant_id = p_tenant_id and m.role = 'assistant' and m.source = 'typed'
       and m.created_at >= p_from and m.created_at < p_to and m.outcome = 'answer');
$$;

revoke execute on function cwr.chat_activity(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function cwr.chat_activity(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Indexes: one per sort, the word search, and the activity counts.
-- ---------------------------------------------------------------------------

create index chat_sessions_question_count_idx on cwr.chat_sessions (tenant_id, question_count desc, handoff_count desc, started_at desc);
create index chat_sessions_first_question_sort_idx on cwr.chat_sessions (tenant_id, first_question_sort, started_at desc);
create index chat_sessions_inbox_started_idx on cwr.chat_sessions (tenant_id, started_at) where inbox_thread_id is not null;
create index chat_messages_body_trgm_idx on cwr.chat_messages using gin (body extensions.gin_trgm_ops);
create index chat_messages_typed_reply_idx on cwr.chat_messages (tenant_id, created_at) where role = 'assistant' and source = 'typed';

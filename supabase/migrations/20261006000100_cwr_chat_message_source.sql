-- Chat guided topics (docs/cwr-chat-guided-options-plan.md §6): where a chat message came
-- from. "typed" is the default, so every existing row and every page built before this
-- change keeps working; "guided" marks a topic button and its fixed quick answer. Only
-- typed questions count toward the per-chat message limit. Additive and backward compatible
-- (Infra §3 expand-only).

create type cwr.chat_message_source as enum ('typed', 'guided');

alter table cwr.chat_messages
  add column source cwr.chat_message_source not null default 'typed';

comment on column cwr.chat_messages.source is 'typed: a question the visitor wrote and its reply; guided: a topic button and its fixed quick answer.';

-- When the chat's first typed question arrived. Chats started by topic buttons have none until
-- the visitor types, so the site-wide hourly chat limit (an AI cost guard) counts chats by their
-- first typed question: taps can neither use it up nor skip it. Every chat before this change
-- began with a typed question, so it is backfilled from its start time.
alter table cwr.chat_sessions
  add column first_question_at timestamptz;

update cwr.chat_sessions set first_question_at = started_at where first_question_at is null;

create index chat_sessions_first_question_idx on cwr.chat_sessions (tenant_id, first_question_at);

comment on column cwr.chat_sessions.first_question_at is 'When the visitor first typed a question; null for a chat with topic buttons only.';

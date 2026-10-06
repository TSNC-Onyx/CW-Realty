-- Chat test questions, round 4 (docs/cwr-chat-quick-answers-and-tests-plan.md §C). Two optional
-- checks per owner question, both off by default so every existing question is graded as before:
-- allows_friendly_reply: a friendly reply in the assistant's own words also passes "should answer";
-- must_mention: up to 3 short phrases the reply must contain (a fact check, ignoring case).
-- Additive and backward compatible (Infra §3 expand-only).

alter table cwr.chat_policy_tests
  add column allows_friendly_reply boolean not null default false,
  add column must_mention text[] not null default '{}'
    constraint chat_policy_tests_must_mention_limit check (cardinality(must_mention) <= 3);

comment on column cwr.chat_policy_tests.allows_friendly_reply is 'true: an AI-written friendly reply also passes a "should answer" question.';
comment on column cwr.chat_policy_tests.must_mention is 'Up to 3 phrases the reply must contain (case-insensitive).';

-- Problem-log names for the two new owner actions (Customer-facing errors must be logged).
insert into cwr.problem_catalog (action, area, label, section_label, spike_codes) values
  ('chat_policy.update_test', 'chat_policy', 'Change a policy test question', 'Chat policy', '{}'),
  ('chat_policy.save_quick_answers', 'chat_policy', 'Save the chat topic answers', 'Chat policy', '{}');

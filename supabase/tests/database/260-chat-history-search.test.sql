-- Chat history: stored counts, activity figures, access, and speed at 10,000 chats.
begin;
select plan(23);
select cwr_test.create_fixture();

-- ---------------------------------------------------------------- stored counts
insert into cwr.chat_sessions (id, tenant_id) values ('f2600000-0000-0000-0000-000000000001', cwr_test.id('tenant_a'));

-- Same shape as recordChatExchange: one two-row insert, visitor first.
insert into cwr.chat_messages (tenant_id, session_id, role, body, cited_sections, outcome, source) values
  (cwr_test.id('tenant_a'), 'f2600000-0000-0000-0000-000000000001', 'visitor', 'Do you handle rentals?', '{}', null, 'typed'),
  (cwr_test.id('tenant_a'), 'f2600000-0000-0000-0000-000000000001', 'assistant', 'A person will help.', '{}', 'handoff', 'typed');
select is(
  (select array[question_count, handoff_count] from cwr.chat_sessions where id = 'f2600000-0000-0000-0000-000000000001'),
  array[1, 1],
  'An exchange that hands off counts one question and one hand-off'
);
select is(
  (select first_question from cwr.chat_sessions where id = 'f2600000-0000-0000-0000-000000000001'),
  'Do you handle rentals?',
  'The first visitor message becomes the chat''s first question'
);

insert into cwr.chat_messages (tenant_id, session_id, role, body, cited_sections, outcome, source) values
  (cwr_test.id('tenant_a'), 'f2600000-0000-0000-0000-000000000001', 'visitor', 'What does it cost?', '{}', null, 'guided'),
  (cwr_test.id('tenant_a'), 'f2600000-0000-0000-0000-000000000001', 'assistant', 'Nothing up front.', '{Costs}', 'answer', 'guided');
select is(
  (select array[question_count, handoff_count] from cwr.chat_sessions where id = 'f2600000-0000-0000-0000-000000000001'),
  array[2, 1],
  'A topic-button tap counts as a question, and an answer is not a hand-off'
);
select is(
  (select first_question from cwr.chat_sessions where id = 'f2600000-0000-0000-0000-000000000001'),
  'Do you handle rentals?',
  'A later message never replaces the first question'
);

insert into cwr.chat_sessions (id, tenant_id) values ('f2600000-0000-0000-0000-000000000002', cwr_test.id('tenant_a'));
insert into cwr.chat_messages (tenant_id, session_id, role, body)
  values (cwr_test.id('tenant_a'), 'f2600000-0000-0000-0000-000000000002', 'visitor', repeat('a', 400));
select is(
  (select length(first_question) from cwr.chat_sessions where id = 'f2600000-0000-0000-0000-000000000002'),
  300,
  'A long first question is cut to 300 characters'
);
select is(
  (select first_question_sort from cwr.chat_sessions where id = 'f2600000-0000-0000-0000-000000000001'),
  'do you handle rentals?',
  'The A-Z sort key ignores capitals'
);

select is_empty(
  $$ select s.id from cwr.chat_sessions s
     left join (
       select session_id, count(*) filter (where role = 'visitor') as questions, count(*) filter (where outcome = 'handoff') as handoffs
       from cwr.chat_messages group by session_id
     ) a on a.session_id = s.id
     where s.question_count <> coalesce(a.questions, 0) or s.handoff_count <> coalesce(a.handoffs, 0) $$,
  'Every chat''s stored counts match its messages'
);

select is_empty(
  $$ select 1 from cwr.audit_log
     where table_name = 'chat_sessions' and record_id = 'f2600000-0000-0000-0000-000000000001'
       and (new_values ? 'first_question' or new_values ? 'first_question_sort' or old_values ? 'first_question') $$,
  'The audit log leaves out the first question, like message text'
);

delete from cwr.chat_sessions where id = 'f2600000-0000-0000-0000-000000000002';
select is_empty(
  $$ select 1 from cwr.chat_messages where session_id = 'f2600000-0000-0000-0000-000000000002' $$,
  'Deleting a chat still removes its messages'
);

-- ---------------------------------------------------------------- activity figures
delete from cwr.chat_sessions where tenant_id = cwr_test.id('tenant_a');
insert into cwr.chat_sessions (id, tenant_id, started_at, inbox_thread_id) values
  ('f2600000-0000-0000-0000-000000000011', cwr_test.id('tenant_a'), '2026-10-10 12:00Z', cwr_test.id('staff_thread')),
  ('f2600000-0000-0000-0000-000000000012', cwr_test.id('tenant_a'), '2026-10-11 12:00Z', null),
  ('f2600000-0000-0000-0000-000000000013', cwr_test.id('tenant_a'), '2026-09-01 12:00Z', null);
insert into cwr.chat_messages (tenant_id, session_id, role, body, outcome, source, created_at) values
  (cwr_test.id('tenant_a'), 'f2600000-0000-0000-0000-000000000011', 'assistant', 'Answered.', 'answer', 'typed', '2026-10-10 12:01Z'),
  (cwr_test.id('tenant_a'), 'f2600000-0000-0000-0000-000000000011', 'assistant', 'A person will help.', 'handoff', 'typed', '2026-10-10 12:02Z'),
  (cwr_test.id('tenant_a'), 'f2600000-0000-0000-0000-000000000012', 'assistant', 'Button answer.', 'answer', 'guided', '2026-10-11 12:01Z'),
  (cwr_test.id('tenant_a'), 'f2600000-0000-0000-0000-000000000013', 'assistant', 'Old answer.', 'answer', 'typed', '2026-09-01 12:01Z');

select is(
  (select array[chats, sent_to_inbox, typed_replies, typed_answers]
   from cwr.chat_activity(cwr_test.id('tenant_a'), '2026-10-05Z', '2026-10-12Z')),
  array[2, 1, 2, 1],
  'Activity counts chats, inbox hand-offs, and typed replies in the span, leaving out topic-button answers and older chats'
);
select is(
  (select chats from cwr.chat_activity(cwr_test.id('tenant_a'), '2026-10-10 12:00Z', '2026-10-11 12:00Z')),
  1,
  'A span includes its start and leaves out its end'
);

select cwr_test.sign_in('manager');
set local role authenticated;
select is(
  (select chats from cwr.chat_activity(cwr_test.id('tenant_a'), '2026-10-05Z', '2026-10-12Z')),
  2,
  'Managers see the activity figures'
);
reset role;
select cwr_test.sign_in('staff');
set local role authenticated;
select is(
  (select array[chats, sent_to_inbox, typed_replies, typed_answers]
   from cwr.chat_activity(cwr_test.id('tenant_a'), '2026-10-05Z', '2026-10-12Z')),
  array[0, 0, 0, 0],
  'Staff see no chat activity'
);
select is_empty(
  $$ select first_question from cwr.chat_sessions $$,
  'Staff cannot read chats or their first questions'
);
reset role;
select ok(
  not has_function_privilege('anon', 'cwr.chat_activity(uuid, timestamptz, timestamptz)', 'execute'),
  'Visitors cannot run the activity function'
);

-- ---------------------------------------------------------------- indexes
select has_index('cwr', 'chat_sessions', 'chat_sessions_question_count_idx', 'Details sort is indexed');
select has_index('cwr', 'chat_sessions', 'chat_sessions_first_question_sort_idx', 'Question sort is indexed');
select has_index('cwr', 'chat_messages', 'chat_messages_body_trgm_idx', 'Search is indexed');
select has_index('cwr', 'chat_messages', 'chat_messages_typed_reply_idx', 'Answered rate is indexed');

-- ---------------------------------------------------------------- speed (Infra §5: under 300ms)
-- 10,000 chats of six messages each, about what a year of steady use could hold.
insert into cwr.chat_sessions (id, tenant_id, started_at)
select
  ('f2610000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  cwr_test.id('tenant_a'),
  now() - (n || ' minutes')::interval * 50
from generate_series(1, 10000) n;
insert into cwr.chat_messages (tenant_id, session_id, role, body, outcome, source, created_at)
select
  cwr_test.id('tenant_a'),
  ('f2610000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  case when step % 2 = 1 then 'visitor'::cwr.chat_message_role else 'assistant'::cwr.chat_message_role end,
  case
    when step % 2 = 1 then 'Question ' || step || ' about ' || (array['rentals', 'selling', 'buying', 'fees', 'harbor view'])[1 + n % 5] || ' number ' || n
    else 'Here is what the policy says about that, visitor ' || md5(n::text || step::text)
  end,
  case when step % 2 = 0 then (case when n % 7 = 0 then 'handoff' else 'answer' end)::cwr.chat_test_outcome end,
  'typed',
  now() - (n || ' minutes')::interval * 50 + (step || ' seconds')::interval
from generate_series(1, 10000) n, generate_series(1, 6) step;
analyze cwr.chat_sessions;
analyze cwr.chat_messages;

select cwr_test.sign_in('owner');
set local role authenticated;
do $$
declare
  v_start timestamptz;
  v_tenant uuid := cwr_test.id('tenant_a');
begin
  -- Word search, the shape PostgREST builds for an inner embed: page of 25 plus the total.
  v_start := clock_timestamp();
  perform s.id from cwr.chat_sessions s
    where s.tenant_id = v_tenant and exists (select 1 from cwr.chat_messages m where m.session_id = s.id and m.tenant_id = s.tenant_id and m.body ilike '%harbor%')
    order by s.started_at desc limit 25;
  perform count(*) from cwr.chat_sessions s
    where s.tenant_id = v_tenant and exists (select 1 from cwr.chat_messages m where m.session_id = s.id and m.tenant_id = s.tenant_id and m.body ilike '%harbor%');
  perform set_config('cwr_test.search_ms', (extract(epoch from clock_timestamp() - v_start) * 1000)::text, true);

  v_start := clock_timestamp();
  perform s.id from cwr.chat_sessions s
    where s.tenant_id = v_tenant and exists (select 1 from cwr.chat_messages m where m.session_id = s.id and m.tenant_id = s.tenant_id and m.body ilike '%fe%')
    order by s.started_at desc limit 25;
  perform set_config('cwr_test.short_search_ms', (extract(epoch from clock_timestamp() - v_start) * 1000)::text, true);

  v_start := clock_timestamp();
  perform id from cwr.chat_sessions where tenant_id = v_tenant order by question_count desc, handoff_count desc, started_at desc, id limit 25 offset 9975;
  perform id from cwr.chat_sessions where tenant_id = v_tenant order by question_count, handoff_count, started_at desc, id limit 25 offset 9975;
  perform id from cwr.chat_sessions where tenant_id = v_tenant order by first_question_sort nulls last, started_at desc, id limit 25 offset 9975;
  perform id from cwr.chat_sessions where tenant_id = v_tenant order by first_question_sort desc nulls last, started_at desc, id limit 25 offset 9975;
  perform count(*) from cwr.chat_sessions where tenant_id = v_tenant;
  perform set_config('cwr_test.sort_ms', (extract(epoch from clock_timestamp() - v_start) / 4 * 1000)::text, true);

  v_start := clock_timestamp();
  perform * from cwr.chat_activity(v_tenant, now() - interval '180 days', now() - interval '90 days');
  perform * from cwr.chat_activity(v_tenant, now() - interval '90 days', now());
  perform set_config('cwr_test.activity_ms', (extract(epoch from clock_timestamp() - v_start) * 1000)::text, true);
end;
$$;
reset role;

select cmp_ok(current_setting('cwr_test.search_ms')::numeric, '<', 300::numeric, 'A word search over 10,000 chats takes under 300ms');
select cmp_ok(current_setting('cwr_test.short_search_ms')::numeric, '<', 300::numeric, 'A two-letter search takes under 300ms');
select cmp_ok(current_setting('cwr_test.sort_ms')::numeric, '<', 300::numeric, 'Each sort, either way, on the last page takes under 300ms');
select cmp_ok(current_setting('cwr_test.activity_ms')::numeric, '<', 300::numeric, 'Both 90-day activity spans take under 300ms together');

select * from finish();
rollback;

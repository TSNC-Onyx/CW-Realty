-- Chat assistant (Phase 5; Features §2, Admin §6).
-- Expand-only: one nullable column and one new service-only function.

-- ---------------------------------------------------------------------------
-- Weekly review: each assistant reply records whether it answered from the policy
-- or handed the visitor to a person, so gaps in the policy are easy to find.
-- ---------------------------------------------------------------------------

alter table cwr.chat_messages
  add column outcome cwr.chat_test_outcome,
  add constraint chat_messages_outcome_only_on_replies check (role = 'assistant' or outcome is null);

create index chat_messages_handoff_idx on cwr.chat_messages (tenant_id, created_at desc) where outcome = 'handoff';

-- ---------------------------------------------------------------------------
-- A policy test run is saved only if the draft text and the test questions are the
-- same ones the run actually checked. Without this, an edit saved while a run was in
-- progress would be published on the strength of a run that never saw it.
-- ---------------------------------------------------------------------------

create function cwr.record_chat_policy_test_run(
  p_policy_id uuid,
  p_policy_updated_at timestamptz,
  p_tests_updated_at timestamptz,
  p_is_passed boolean,
  p_results jsonb,
  p_ran_by uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_policy record;
  v_run_id uuid;
begin
  select id, tenant_id, status, updated_at into v_policy
  from cwr.chat_policies
  where id = p_policy_id
  for update;
  if v_policy.id is null then
    raise exception 'Policy version not found' using errcode = 'no_data_found';
  end if;
  if v_policy.status <> 'draft' then
    raise exception 'Only a draft can be tested' using errcode = 'check_violation';
  end if;
  if v_policy.updated_at <> p_policy_updated_at then
    raise exception 'The draft changed while the tests ran; run them again'
      using errcode = 'check_violation';
  end if;
  if (select max(t.updated_at) from cwr.chat_policy_tests t where t.tenant_id = v_policy.tenant_id)
     is distinct from p_tests_updated_at then
    raise exception 'The test questions changed while the tests ran; run them again'
      using errcode = 'check_violation';
  end if;

  insert into cwr.chat_policy_test_runs (tenant_id, policy_id, is_passed, results, ran_by)
  values (v_policy.tenant_id, v_policy.id, p_is_passed, p_results, p_ran_by)
  returning id into v_run_id;
  return v_run_id;
end;
$$;

revoke execute on function cwr.record_chat_policy_test_run(uuid, timestamptz, timestamptz, boolean, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function cwr.record_chat_policy_test_run(uuid, timestamptz, timestamptz, boolean, jsonb, uuid)
  to service_role;

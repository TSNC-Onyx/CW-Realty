-- Least privilege for functions: Postgres lets everyone execute new functions by
-- default, so revoke that and grant back only what signed-in users need.

revoke execute on all functions in schema cwr from public, anon, authenticated;

-- Used inside RLS policies, so the querying role must be able to run them.
grant execute on function
  cwr.is_mfa_verified(),
  cwr.tenant_ids_with_role(cwr.member_role[]),
  cwr.member_tenant_ids(),
  cwr.editor_tenant_ids(),
  cwr.owner_tenant_ids(),
  cwr.is_service_context()
  to authenticated, service_role;

-- The workflow engine and the helpers it calls as the invoking user.
grant execute on function
  cwr.transition(text, uuid, text),
  cwr.get_workflow_step(text, uuid, text, text),
  cwr.is_allowed_to_make(cwr.workflow_transitions)
  to authenticated, service_role;

-- Visitors' pages ask whether a team member is hidden (to redirect 302 to /team).
grant execute on function cwr.is_hidden_team_member(uuid, text) to anon, authenticated, service_role;

-- The single CWR tenant. Its workflows are installed by the tenants trigger.
insert into cwr.tenants (slug, name)
values ('cwr', 'Charlie Ward Realty')
on conflict (slug) do nothing;

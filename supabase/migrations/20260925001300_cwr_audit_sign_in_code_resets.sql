-- Audit entry for an owner resetting someone's sign-in codes (Admin §7 "every change
-- logged with who and when"). The reset itself happens in Supabase Auth, outside the
-- cwr tables, so the admin portal records it through this function.
-- Expand-only: the audit action list gains 'mfa_reset'.

alter table cwr.audit_log drop constraint audit_log_action_check;
alter table cwr.audit_log
  add constraint audit_log_action_check check (action in ('insert', 'update', 'delete', 'transition', 'mfa_reset'));

create function cwr.record_sign_in_codes_reset(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
begin
  select m.tenant_id into v_tenant_id
  from cwr.memberships m
  where m.user_id = p_user_id
    and m.tenant_id in (select cwr.owner_tenant_ids());
  if v_tenant_id is null then
    raise exception 'Only an owner can record this for a member of their team' using errcode = 'insufficient_privilege';
  end if;
  insert into cwr.audit_log (tenant_id, actor_id, actor_role, action, table_name, record_id, request_id)
  values (v_tenant_id, (select auth.uid()), 'owner', 'mfa_reset', 'auth.mfa_factors', p_user_id, cwr.get_request_id());
end;
$$;

revoke execute on function cwr.record_sign_in_codes_reset(uuid) from public, anon;
grant execute on function cwr.record_sign_in_codes_reset(uuid) to authenticated;

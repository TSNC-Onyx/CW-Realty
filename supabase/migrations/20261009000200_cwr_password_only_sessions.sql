-- Admin sign-in with email and password only (owner choice 2026-10-09,
-- docs/cwr-password-only-sign-in-plan.md). Every admin rule reaches roles through
-- cwr.tenant_ids_with_role(), which required an authenticator-code ("aal2") session through
-- this helper. It now accepts any completed sign-in: a password ("aal1") or a code ("aal2").
-- The name stays so no policy changes; roles, tenants, and the owner-only guards are unchanged.
create or replace function cwr.is_mfa_verified()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') in ('aal1', 'aal2');
$$;

comment on function cwr.is_mfa_verified() is
  'True for a completed sign-in (password or authenticator code). Kept under its old name; see 20261009000200.';

-- The one-time removal of old authenticator codes (scripts/remove-sign-in-codes.mjs) runs with
-- the service role, which may not write the activity log directly. This records each removal
-- like the old "Reset sign-in codes" button did, attributed to the system.
create function cwr.record_sign_in_codes_removed(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into cwr.audit_log (tenant_id, actor_id, actor_role, action, table_name, record_id, request_id)
  select m.tenant_id, null, 'system', 'mfa_reset', 'auth.mfa_factors', p_user_id, cwr.get_request_id()
  from cwr.memberships m
  where m.user_id = p_user_id;
end;
$$;

revoke execute on function cwr.record_sign_in_codes_removed(uuid) from public, anon, authenticated;
grant execute on function cwr.record_sign_in_codes_removed(uuid) to service_role;

-- The owner's "Reset sign-in codes" button is gone, so its activity-log function has no caller
-- left; signed-in people may no longer call it (the function stays for the record).
revoke execute on function cwr.record_sign_in_codes_reset(uuid) from authenticated;

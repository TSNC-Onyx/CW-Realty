-- A good result right after a failure clears the "failing" state (docs/false-alarm-cleanup-plan.md #10).
-- touch_health_check stamps success at most once a minute, so a success within a minute of
-- the last stamp was skipped even when a failure had come in between. The check then stayed
-- "failing" until a later success, and the watchdog repeated a recovered problem every 15
-- minutes. Same signature, so existing grants and callers are unchanged.
create or replace function cwr.touch_health_check(p_name text, p_is_ok boolean, p_error text default null, p_tenant_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := coalesce(p_tenant_id, cwr.get_default_tenant_id());
begin
  insert into cwr.health_checks (tenant_id, name, last_run_at)
  values (v_tenant_id, p_name, now())
  on conflict (tenant_id, name) do update set last_run_at = now();
  if p_is_ok then
    update cwr.health_checks set last_ok_at = clock_timestamp()
    where tenant_id = v_tenant_id and name = p_name
      and (coalesce(last_ok_at, '-infinity') < now() - interval '1 minute' or last_error_at >= coalesce(last_ok_at, '-infinity'));
    return;
  end if;
  update cwr.health_checks
  set last_error = cwr.get_scrubbed_text(coalesce(p_error, 'Failed'), 300), last_error_at = clock_timestamp()
  where tenant_id = v_tenant_id and name = p_name;
end;
$$;

comment on function cwr.touch_health_check(text, boolean, text, uuid) is
  'Records an outcome: success sets last_ok_at (at most once a minute, or at once after a failure), failure the error.';

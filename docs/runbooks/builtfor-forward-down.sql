-- Removes forwarding to BuiltFor Ops (supabase/migrations/20261021000100_cwr_builtfor_forward.sql).
-- Run by hand only (Supabase SQL editor, or psql); migrations are expand-only, so this lives
-- next to the runbook (docs/runbooks/problem-alerts.md, "Forwarding to BuiltFor Ops").
-- To pause instead, keep everything and run:
--   update cwr.builtfor_forward_settings set is_enabled = false;
-- Afterwards also remove the Vault secret builtfor_webhook_secret (Supabase → Vault).
-- Problems already recorded are not touched.

begin;

select cron.unschedule('cwr_forward_builtfor')
where exists (select 1 from cron.job where jobname = 'cwr_forward_builtfor');

drop function if exists cwr.forward_builtfor_alerts();
drop function if exists cwr.purge_builtfor_forwards();
drop function if exists cwr.send_builtfor_forwards(cwr.builtfor_forward_settings, text);
drop function if exists cwr.enqueue_builtfor_forwards(cwr.builtfor_forward_settings);
drop function if exists cwr.reconcile_builtfor_forwards();
drop function if exists cwr.get_builtfor_webhook_secret();
drop function if exists cwr.builtfor_apply_response(uuid, integer, text);
drop function if exists cwr.builtfor_alert_payload(cwr.problem_events, cwr.builtfor_forward_settings);

drop table if exists cwr.builtfor_forwards;
drop table if exists cwr.builtfor_forward_settings;

commit;

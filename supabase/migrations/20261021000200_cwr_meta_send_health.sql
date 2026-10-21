-- Meta send health (docs/cwr-ads-analytics-fixes-plan.md, finding 6, owner approved 2026-10-21).
-- Expand-only: the background checks gain the name meta_conversions, written by the server after
-- each lead sent to Meta, and the problem catalog gains the two new actions the code records.

alter table cwr.health_checks drop constraint health_checks_name_check;
alter table cwr.health_checks add constraint health_checks_name_check
  check (name in ('problem_alerts', 'scheduled_jobs', 'photo_cleanup', 'problem_log_writes', 'email_outbox', 'email_sending', 'meta_conversions')) not valid;
alter table cwr.health_checks validate constraint health_checks_name_check;

insert into cwr.problem_catalog (action, area, label, section_label, spike_codes) values
  ('tracking.meta_send', 'tracking', 'Send a lead to Meta', 'Ads & analytics', '{}'),
  ('site.consent', 'site', 'Save cookie choices', 'Website visitors', '{}');

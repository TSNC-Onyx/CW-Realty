-- Problem-alert emails are paused (owner decision 2026-09-30): the Cloudflare account has no
-- free Cron Trigger for the 5-minute sender (wrangler.jsonc). Its heartbeat row is removed
-- so the database watchdog does not report the paused sender as broken; the sender's first
-- run after emails resume creates the row again (cwr.touch_heartbeat). Problems are still
-- recorded and the other background checks keep running.

delete from cwr.health_checks where name = 'problem_alerts';

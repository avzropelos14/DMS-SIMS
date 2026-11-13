-- Rollback for 20261113010000_sms_iprog.sql
-- Stops all SMS (event alerts, tuition reminders, test) and removes the daily job.
-- SMS already delivered cannot be recalled. pg_net is left installed if anything else uses it.

begin;

select cron.unschedule('sims-tuition-sms') where exists (select 1 from cron.job where jobname = 'sims-tuition-sms');
delete from vault.secrets where name = 'sims_cron_secret';

drop function if exists public.verify_cron_secret(text);
drop function if exists public.claim_tuition_reminders(integer);
drop function if exists public.sms_usage_today();
drop function if exists public.sms_record_result(bigint, boolean, text);
drop function if exists public.claim_event_sms(text, text, uuid);
drop function if exists public.sms_budget_consume();
drop function if exists private.sms_claim(text, text, uuid);
drop function if exists private.ph_mobile(text);
drop table if exists private.sms_log;

delete from private.email_log where channel = 'sms';
delete from private.security_settings where key = 'sms_daily_limit';

commit;

-- Optional, only if no other job or function uses pg_net:
--   drop extension if exists pg_net;

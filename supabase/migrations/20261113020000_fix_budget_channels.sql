-- Fix: private.email_log only accepted the channels 'mfa' and 'security', so counting an
-- 'office' email (20261112010000) or an 'sms' (20261113010000) failed, and those sends were
-- treated as over the daily limit. Widens the allowed channels; nothing else changes.
-- Rollback: supabase/rollbacks/20261113020000_fix_budget_channels.sql

begin;

alter table private.email_log drop constraint if exists email_log_channel_check;
alter table private.email_log add constraint email_log_channel_check
  check (channel = any (array['mfa', 'security', 'office', 'sms']));

-- Test SMS that never reached iProg (refused by the old check) are cleared from the log.
delete from private.sms_log where kind = 'test' and status = 'failed' and provider_message_id is null;

commit;

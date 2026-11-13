-- Rollback for 20261113020000_fix_budget_channels.sql
-- Restores the original two-channel check. Office emails and SMS stop being counted (and so
-- stop sending) again; their counters are removed first so the old check can be applied.

begin;

delete from private.email_log where channel in ('office', 'sms');
alter table private.email_log drop constraint if exists email_log_channel_check;
alter table private.email_log add constraint email_log_channel_check
  check (channel = any (array['mfa', 'security']));

commit;

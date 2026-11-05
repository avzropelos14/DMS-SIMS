-- Rollback for supabase/migrations/20261105160000_phase3_email_budget_split.sql
update private.security_settings set value = '70', updated_at = now() where key = 'email_daily_limit_mfa';
update private.security_settings set value = '30', updated_at = now() where key = 'email_daily_limit_security';

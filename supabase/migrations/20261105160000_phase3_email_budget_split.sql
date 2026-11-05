-- Phase 3 follow-up: Supabase Auth's own emails (invites, password-reset links) also go
-- through Resend's 100/day but bypass email_budget_consume, so leave them at least 20.
-- Applied 2026-11-05 (as a data update). Rollback: supabase/rollbacks/20261105160000_phase3_email_budget_split.sql
update private.security_settings set value = '60', updated_at = now() where key = 'email_daily_limit_mfa';
update private.security_settings set value = '20', updated_at = now() where key = 'email_daily_limit_security';

-- Rollback for supabase/migrations/20261104010000_phase2_audit_log_and_mfa.sql
-- WARNING: dropping audit_log deletes the evidence trail. Export it first
-- (select * from public.audit_log) and only run this with explicit approval.
-- Redeploy the pre-Phase-2 edge functions first: the new ones call these objects.

begin;

drop function if exists public.admin_revoke_user_sessions(uuid);
drop function if exists public.mfa_register_failed_attempt(uuid, integer);
drop index if exists public.mfa_codes_user_created_idx;
alter table public.mfa_codes drop column if exists last_failed_at;

drop trigger if exists audit_log_append_only on public.audit_log;
drop function if exists public.audit_log_block_changes();
drop table if exists public.audit_log;

commit;

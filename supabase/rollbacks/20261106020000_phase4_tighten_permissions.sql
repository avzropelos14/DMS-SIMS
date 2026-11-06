-- Rollback for supabase/migrations/20261106020000_phase4_tighten_permissions.sql
-- Deploy the pre-Phase-4 Guard portal first (the new one calls guard_record_pickup /
-- guard_pickup_history, which this drops).

begin;

drop policy if exists "staff read scope" on public.students;
drop policy if exists "staff read scope" on public.guardians;
drop policy if exists "staff read scope" on public.student_guardians;
drop policy if exists "staff read scope" on public.student_accounts;
drop policy if exists "staff read scope" on public.pickup_authorizations;
drop policy if exists "staff read scope" on public.pickup_qr_codes;
drop policy if exists "staff read scope" on public.pickup_logs;
drop policy if exists "guardian update scope" on public.pickup_authorizations;
drop policy if exists "payment writers" on public.payments;
drop policy if exists "payment editors" on public.payments;
drop policy if exists "payment removers" on public.payments;

drop trigger if exists pickup_authorizations_limit_update on public.pickup_authorizations;
drop trigger if exists guardians_limit_self_update on public.guardians;
drop trigger if exists pickup_logs_append_only on public.pickup_logs;

drop function if exists private.pickup_authorizations_limit_update();
drop function if exists private.guardians_limit_self_update();
drop function if exists private.pickup_logs_block_changes();
drop function if exists public.guard_record_pickup(jsonb);
drop function if exists public.guard_pickup_history(integer);
drop function if exists public.teacher_sees_student(text);

commit;

-- Rollback for supabase/migrations/20261106120000_phase5a_secure_pickup_qr.sql
-- Deploy the pre-5A Guard and Parent portals first. This discards every QR secret and
-- same-day override; access_status values are dropped with the column.

begin;

grant execute on function public.guard_record_pickup(jsonb) to authenticated;

drop function if exists public.verify_pickup_qr(text);
drop function if exists public.confirm_pickup(text);
drop function if exists public.reject_pickup(text, text);
drop function if exists public.my_pickup_qr_codes();
drop function if exists private.pickup_qr_lookup(text);
drop function if exists private.require_verified_guard();

drop trigger if exists student_guardians_issue_qr_secret on public.student_guardians;
drop function if exists private.student_guardians_issue_qr_secret();

drop table if exists private.pickup_day_overrides;
drop table if exists private.pickup_qr_secrets;
drop index if exists public.pickup_logs_student_scanned_idx;
drop index if exists public.pickup_authorizations_qr_token_key;

alter table public.student_guardians drop constraint if exists student_guardians_access_status_check;
alter table public.student_guardians drop column if exists access_status;

commit;

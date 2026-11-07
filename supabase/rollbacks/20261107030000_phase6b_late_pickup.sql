-- Rollback for 20261107030000_phase6b_late_pickup.sql
-- Removes the late-pickup protocol (today's absent / handed-over marks, late notices and
-- closed days are lost; the audit log keeps its entries).

begin;

drop function if exists public.campus_status_today();
drop function if exists public.student_call_list(text);
drop function if exists public.notify_parent_late(text);
drop function if exists public.set_student_day_status(text, text, text, text);
drop function if exists public.clear_student_day_status(text);
drop function if exists public.close_dismissal_day(text);
drop function if exists public.claim_late_notice_email(bigint, uuid);
drop function if exists private.campus_rows(date);
drop function if exists private.require_verified_gate_staff();

drop table if exists private.dismissal_days;
drop table if exists private.late_notices;
drop table if exists private.dismissal_student_status;

commit;

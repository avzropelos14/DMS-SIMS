-- Rollback for 20261108020000_phase7_student_requirements.sql
-- Removes the requirements checklist (its records are lost) and the conditional-enrollment
-- columns on enrollments.

begin;

drop function if exists public.office_pickup_pass_links(text);
drop function if exists public.issue_pickup_pass(uuid);
drop table if exists public.student_requirements;
drop function if exists private.student_requirements_stamp();
drop table if exists public.requirement_catalog;
alter table public.enrollments
  drop column if exists conditional_deadline,
  drop column if exists conditional_note;

commit;

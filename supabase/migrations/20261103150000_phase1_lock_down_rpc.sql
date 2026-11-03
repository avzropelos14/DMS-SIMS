-- Phase 1 (H4, M5): stop anonymous callers from using SECURITY DEFINER RPCs,
-- add a caller role check to the receipt-number functions, and drop anon's
-- unused default table privileges.
-- Rollback: supabase/rollbacks/20261103150000_phase1_lock_down_rpc.sql

begin;

-- Receipt numbers: cashier and full_admin only (CashierPortal is the only caller).
create or replace function public.next_receipt_number()
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.current_staff_role() in ('cashier', 'full_admin'), false) is not true then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return 'RCT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.receipt_number_seq')::text, 6, '0');
end;
$$;

create or replace function public.claim_or_receipt_number(p_school_year_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
  v_end text;
begin
  if coalesce(public.current_staff_role() in ('cashier', 'full_admin'), false) is not true then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select or_next_number, or_range_end into v_old, v_end
  from public.school_years where id = p_school_year_id
  for update;

  if v_old is null or v_end is null or v_old > v_end then
    raise exception 'No OR range is configured, or the range has been fully issued, for this school year.';
  end if;

  update public.school_years
  set or_next_number = case
        when v_old ~ '^[0-9]+$' then lpad((v_old::int + 1)::text, length(v_old), '0')
        else v_old
      end
  where id = p_school_year_id;

  return v_old;
end;
$$;

-- create or replace keeps the existing ACL, so revoke afterwards.
revoke execute on function public.next_receipt_number()               from public, anon;
revoke execute on function public.claim_or_receipt_number(uuid)       from public, anon;
revoke execute on function public.advises_class_section_subject(uuid) from public, anon;
grant  execute on function public.next_receipt_number()               to authenticated;
grant  execute on function public.claim_or_receipt_number(uuid)       to authenticated;
-- Still needed by the grades policy "adviser reads section grades".
grant  execute on function public.advises_class_section_subject(uuid) to authenticated;

-- The RLS helpers (is_admin_or_registrar, is_staff_role, current_staff_role,
-- current_employee_id, current_student_id, is_guardian_of, can_view_academics_for,
-- teaches_class_section_subject) already have no anon/PUBLIC grant; nothing to change.

-- anon never needs TRUNCATE / TRIGGER / REFERENCES / MAINTAIN (PostgREST cannot use them anyway).
-- anon keeps SELECT on school_settings, which the login screen reads.
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'v', 'm') loop
    execute format('revoke truncate, trigger, references, maintain on public.%I from anon', r.relname);
  end loop;
end $$;
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references, maintain on tables from anon;

commit;

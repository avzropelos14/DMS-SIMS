-- Rollback for supabase/migrations/20261105150000_phase3_mfa_enforcement.sql
-- Faster first step, no rollback needed: switch enforcement off
--   update private.security_settings set value = 'off' where key = 'enforce_mfa_in_rls';
-- Full rollback: redeploy the pre-Phase-3 edge functions FIRST (the new ones call these
-- functions), then run this. It discards verified sessions, recovery codes, the email
-- counter and the server-side "must change password" list.

begin;

do $$
declare r record;
begin
  for r in select tablename from pg_policies where schemaname = 'public' and policyname = 'mfa required' loop
    execute format('drop policy "mfa required" on public.%I', r.tablename);
  end loop;
end $$;
drop policy if exists "mfa required for id card photos" on storage.objects;

drop trigger if exists on_auth_user_password_changed on auth.users;

-- Receipt RPCs back to their Phase 1 versions.
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
revoke execute on function public.next_receipt_number()         from public, anon;
revoke execute on function public.claim_or_receipt_number(uuid) from public, anon;
grant  execute on function public.next_receipt_number()         to authenticated;
grant  execute on function public.claim_or_receipt_number(uuid) to authenticated;

drop function if exists public.my_login_status();
drop function if exists public.mfa_mark_session_verified(uuid, uuid, text);
drop function if exists public.mfa_check_session(uuid, uuid);
drop function if exists public.mark_password_change_required(uuid, text);
drop function if exists public.email_budget_consume(text);
drop function if exists public.mfa_issue_recovery_code(uuid, text, uuid);
drop function if exists public.mfa_consume_recovery_code(uuid, text);

drop schema if exists private cascade;

commit;

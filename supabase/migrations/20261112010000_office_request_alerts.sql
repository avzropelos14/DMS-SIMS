-- Office request alerts: the admin and registrar hear about a parent's self-dismissal request
-- that needs approval (below the minimum grade), and the admin hears about a teacher's request
-- to reopen a locked grade. Each gets an in-app notification (always) and one email (within
-- its own small daily budget, sent by the notify-office-request edge function).
-- Also: an email limit of 'unlimited' now means no daily cap (for a future paid email plan).
-- Additive only. Rollback: supabase/rollbacks/20261112010000_office_request_alerts.sql

begin;

-- ─── email budget: a separate "office" channel ───
-- Resend's free plan is 100 emails/day; Supabase Auth's own emails need about 20 of them.
-- Sign-in codes peak near 10/day, so 45 still leaves plenty: 45 mfa + 20 security + 15 office.
insert into private.security_settings (key, value) values ('email_daily_limit_office', '15')
on conflict (key) do nothing;
update private.security_settings set value = '45', updated_at = now()
where key = 'email_daily_limit_mfa' and value = '60';

-- Ready for a paid email plan: a limit of 'unlimited' means no daily cap for that channel
-- (emails are still counted in private.email_log). To lift every cap later, in the SQL Editor:
--   update private.security_settings set value = 'unlimited', updated_at = now()
--   where key like 'email_daily_limit_%';
-- A number keeps working as before; a missing, zero or unreadable value still blocks sending.
create or replace function public.email_budget_consume(p_channel text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_raw text := (select btrim(lower(value)) from private.security_settings
                 where key = 'email_daily_limit_' || p_channel);
  v_limit integer;
  v_day date := (now() at time zone 'utc')::date;
  v_count integer;
begin
  if v_raw = 'unlimited' then
    insert into private.email_log as e (day, channel, count) values (v_day, p_channel, 1)
    on conflict (day, channel) do update set count = e.count + 1;
    return true;
  end if;
  v_limit := case when v_raw ~ '^[0-9]{1,9}$' then v_raw::integer else 0 end;
  if v_limit <= 0 then return false; end if;
  insert into private.email_log as e (day, channel, count) values (v_day, p_channel, 1)
  on conflict (day, channel) do update set count = e.count + 1 where e.count < v_limit
  returning e.count into v_count;
  return v_count is not null;
end;
$$;
revoke execute on function public.email_budget_consume(text) from public, anon, authenticated;
grant execute on function public.email_budget_consume(text) to service_role;

-- ─── each request is emailed at most once ───
create table if not exists private.office_request_emails (
  kind text not null,
  ref_id uuid not null,
  claimed_at timestamptz not null default now(),
  primary key (kind, ref_id)
);
alter table private.office_request_emails enable row level security;
revoke all on private.office_request_emails from public, anon, authenticated;

-- Office accounts that should hear about a request (synthetic logins are skipped by the email).
create or replace function private.office_recipients(p_roles text[])
returns table (user_id uuid, email text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.email
  from public.profiles p
  left join public.employees e on e.id::text = p.employee_id
  where p.role::text = any (p_roles) and e.deleted_at is null;
$$;
revoke execute on function private.office_recipients(text[]) from public, anon, authenticated;

create or replace function private.travel_mode_label(p_mode text)
returns text language sql immutable set search_path = '' as $$
  select case p_mode
    when 'walk' then 'Walking'
    when 'public_transport' then 'Public transport'
    when 'bicycle' then 'Bicycle'
    when 'school_service' then 'School service'
    else 'Other' end;
$$;
revoke execute on function private.travel_mode_label(text) from public, anon, authenticated;

-- What a grade reopen request is about, in words: teacher, student, subject and section.
create or replace function private.grade_reopen_summary(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'teacher_name', coalesce(e.full_name, 'A teacher'),
    'student_name', private.student_display_name(r.student_id),
    'subject', coalesce(sub.name, 'a subject'),
    'section', coalesce(cs.grade_level || ' – ' || cs.section_name, ''),
    'quarter', upper(r.quarter),
    'reason', nullif(btrim(coalesce(r.notes, '')), ''),
    'requested_by', r.requested_by)
  from public.grade_reopen_requests r
  left join public.employees e on e.id::text = r.requested_by
  left join public.class_section_subjects css on css.id = r.class_section_subject_id
  left join public.subjects sub on sub.id = css.subject_id
  left join public.class_sections cs on cs.id = css.class_section_id
  where r.id = p_id;
$$;
revoke execute on function private.grade_reopen_summary(uuid) from public, anon, authenticated;

-- ─── in-app notifications ───
create or replace function private.notify_office_self_dismissal()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name text := private.student_display_name(new.student_id);
  v_parent text := coalesce((select full_name from public.guardians where id = new.guardian_id), 'A parent');
  v_user uuid;
begin
  for v_user in select user_id from private.office_recipients(array['full_admin', 'registrar']) loop
    perform private.notify(v_user, 'self_dismissal_request',
      'Self-dismissal request for ' || v_name,
      v_parent || ' asks that ' || v_name || ' may leave school on their own from '
        || to_char(new.valid_from, 'Mon FMDD') || ' to ' || to_char(new.valid_to, 'Mon FMDD')
        || '. It needs approval under Self-Dismissal Requests.');
  end loop;
  return null;
end;
$$;
revoke execute on function private.notify_office_self_dismissal() from public, anon, authenticated;
drop trigger if exists self_dismissal_notify_office on private.self_dismissal_permissions;
create trigger self_dismissal_notify_office after insert on private.self_dismissal_permissions
  for each row when (new.status = 'pending_approval')
  execute function private.notify_office_self_dismissal();

create or replace function private.notify_admin_grade_reopen()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v jsonb := private.grade_reopen_summary(new.id);
  v_user uuid;
begin
  for v_user in select user_id from private.office_recipients(array['full_admin']) loop
    perform private.notify(v_user, 'grade_edit_request',
      'Grade edit request from ' || (v ->> 'teacher_name'),
      (v ->> 'teacher_name') || ' asks to reopen ' || (v ->> 'quarter') || ' ' || (v ->> 'subject')
        || ' for ' || (v ->> 'student_name')
        || coalesce('. Reason: ' || (v ->> 'reason'), '')
        || '. Review it under Classes → Grade Edit Requests.');
  end loop;
  return null;
end;
$$;
revoke execute on function private.notify_admin_grade_reopen() from public, anon, authenticated;
drop trigger if exists grade_reopen_notify_admin on public.grade_reopen_requests;
create trigger grade_reopen_notify_admin after insert on public.grade_reopen_requests
  for each row when (new.status = 'pending')
  execute function private.notify_admin_grade_reopen();

-- ─── for the notify-office-request edge function only (service role) ───
-- Checks the request was just made by this caller and still waits for a decision, claims it so
-- it is emailed once, and returns the recipients and wording. Null when nothing should be sent.
create or replace function public.claim_office_request_email(p_kind text, p_id uuid, p_caller uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_p record;
  v jsonb;
  v_claimed int;
begin
  if p_kind = 'self_dismissal' then
    select * into v_p from private.self_dismissal_permissions
    where id = p_id and guardian_id = p_caller and status = 'pending_approval'
      and created_at > now() - interval '10 minutes';
    if not found then return null; end if;
    v := jsonb_build_object(
      'student_name', private.student_display_name(v_p.student_id),
      'grade', (select grade_level from public.students where id = v_p.student_id),
      'parent_name', coalesce((select full_name from public.guardians where id = v_p.guardian_id), 'A parent'),
      'valid_from', to_char(v_p.valid_from, 'FMMonth FMDD, YYYY'),
      'valid_to', to_char(v_p.valid_to, 'FMMonth FMDD, YYYY'),
      'earliest', to_char(v_p.earliest_release_time, 'FMHH12:MI AM'),
      'travel', private.travel_mode_label(v_p.travel_mode),
      'travel_note', v_p.travel_note,
      'recipients', (select coalesce(jsonb_agg(email), '[]'::jsonb)
                     from private.office_recipients(array['full_admin', 'registrar']) where email is not null));
  elsif p_kind = 'grade_reopen' then
    if not exists (select 1 from public.grade_reopen_requests r
                   join public.profiles pr on pr.id = p_caller and pr.employee_id = r.requested_by
                   where r.id = p_id and r.status = 'pending'
                     and r.requested_at > now() - interval '10 minutes') then
      return null;
    end if;
    v := private.grade_reopen_summary(p_id) || jsonb_build_object(
      'recipients', (select coalesce(jsonb_agg(email), '[]'::jsonb)
                     from private.office_recipients(array['full_admin']) where email is not null));
  else
    return null;
  end if;

  insert into private.office_request_emails (kind, ref_id) values (p_kind, p_id)
  on conflict do nothing;
  get diagnostics v_claimed = row_count;
  if v_claimed = 0 then return null; end if;
  return v;
end;
$$;
revoke execute on function public.claim_office_request_email(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_office_request_email(text, uuid, uuid) to service_role;

commit;

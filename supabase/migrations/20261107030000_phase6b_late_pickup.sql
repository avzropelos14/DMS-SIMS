-- Phase 6B: late-pickup protocol (no SMS, no server cron).
-- Additive only. The guard (or the office) sees every active student's state today:
-- picked up / left on their own (pickup_logs), handed over to staff on duty, absent, or
-- still on campus. Late = still on campus after the "late pickup" time (device clock, set in
-- System Settings). Staff phone parents from a call list, send an in-app notice (plus an email
-- when the budget allows), hand students over to a named staff member, and can only close the
-- day when every student is accounted for.
-- Rollback: supabase/rollbacks/20261107030000_phase6b_late_pickup.sql

begin;

-- Today's non-pickup states (absent, handed over to staff on duty, other exit).
create table private.dismissal_student_status (
  student_id text not null references public.students (id) on delete cascade,
  day date not null,
  status text not null check (status in ('absent', 'handed_over', 'other_exit')),
  staff_name text,
  note text,
  recorded_by uuid,
  recorded_at timestamptz not null default now(),
  primary key (student_id, day)
);
alter table private.dismissal_student_status enable row level security;
revoke all on private.dismissal_student_status from public, anon, authenticated;

-- "Still at school" notices sent to parents (one row per press of Notify parent).
create table private.late_notices (
  id bigint generated always as identity primary key,
  student_id text not null references public.students (id) on delete cascade,
  day date not null,
  sent_by uuid,
  sent_at timestamptz not null default now(),
  emailed_at timestamptz
);
create index late_notices_student_day_idx on private.late_notices (student_id, day);
alter table private.late_notices enable row level security;
revoke all on private.late_notices from public, anon, authenticated;

create table private.dismissal_days (
  day date primary key,
  closed_by uuid,
  closed_at timestamptz not null default now(),
  summary jsonb not null default '{}'::jsonb,
  note text
);
alter table private.dismissal_days enable row level security;
revoke all on private.dismissal_days from public, anon, authenticated;

create or replace function private.require_verified_gate_staff()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if public.current_staff_role() is null
     or public.current_staff_role()::text not in ('guard', 'full_admin', 'registrar')
     or not private.mfa_ok() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function private.require_verified_gate_staff() from public, anon, authenticated;

-- ─── today's state of every active student ───
create or replace function private.campus_rows(p_day date)
returns table (student_id text, student_name text, grade_level text, section text, photo_path text,
               state text, state_at timestamptz, detail text, last_notice_at timestamptz, notices integer)
language sql stable security definer set search_path = '' as $$
  select s.id,
         s.first_name || ' ' || s.last_name,
         s.grade_level, s.section, s.photo_path,
         case when l.method = 'self_dismissal' then 'self_dismissed'
              when l.id is not null then 'picked_up'
              else coalesce(d.status, 'on_campus') end,
         coalesce(l.scanned_at, d.recorded_at),
         case when l.id is not null then l.picked_up_by_name
              when d.status = 'handed_over' then d.staff_name || coalesce(' · ' || d.note, '')
              else d.note end,
         n.last_at, coalesce(n.cnt, 0)::integer
  from public.students s
  left join lateral (
    select pl.id, pl.method, pl.scanned_at, pl.picked_up_by_name from public.pickup_logs pl
    where pl.student_id = s.id and (pl.scanned_at at time zone 'Asia/Manila')::date = p_day
    order by pl.scanned_at desc limit 1
  ) l on true
  left join private.dismissal_student_status d on d.student_id = s.id and d.day = p_day
  left join lateral (
    select max(ln.sent_at) as last_at, count(*) as cnt from private.late_notices ln
    where ln.student_id = s.id and ln.day = p_day
  ) n on true
  where s.status::text = 'Active';
$$;
revoke execute on function private.campus_rows(date) from public, anon, authenticated;

create or replace function public.campus_status_today()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_closed record;
begin
  perform private.require_verified_gate_staff();
  select closed_at, closed_by, summary into v_closed from private.dismissal_days where day = v_today;
  return jsonb_build_object(
    'day', v_today,
    'late_pickup_time', coalesce(private.pickup_setting('late_pickup_time'), '17:00'),
    'closed_at', v_closed.closed_at,
    'closed_by', (select full_name from public.employees e join public.profiles p on p.employee_id = e.id
                  where p.id = v_closed.closed_by),
    'students', coalesce((select jsonb_agg(to_jsonb(r) order by r.grade_level, r.student_name)
                          from private.campus_rows(v_today) r), '[]'::jsonb)
  );
end;
$$;

-- Guardians' and emergency contacts' phone numbers for one student. Each view is logged.
create or replace function public.student_call_list(p_student_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_s record;
  v_list jsonb;
begin
  perform private.require_verified_gate_staff();
  select id, guardian_name, guardian_relationship, guardian_phone, mother_info, father_info, guardian_info
    into v_s from public.students where id = p_student_id;
  if not found then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;
  select coalesce(jsonb_agg(c order by c ->> 'source', c ->> 'name'), '[]'::jsonb) into v_list
  from (
    select jsonb_build_object('source', '1_guardian', 'name', g.full_name, 'relationship', sg.relationship,
                              'phone', g.phone, 'primary', coalesce(sg.is_primary_contact, false)) as c
    from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
    where sg.student_id = p_student_id
    union all
    select jsonb_build_object('source', '2_record', 'name', v_s.guardian_name, 'relationship',
                              coalesce(v_s.guardian_relationship, 'Guardian on record'), 'phone', v_s.guardian_phone, 'primary', false)
    where nullif(btrim(coalesce(v_s.guardian_phone, '')), '') is not null
    union all
    select jsonb_build_object('source', '3_parent', 'name', nullif(btrim(coalesce(x.info ->> 'first_name', '') || ' ' || coalesce(x.info ->> 'last_name', '')), ''), 'relationship', x.label,
                              'phone', x.info ->> 'phone', 'primary', false)
    from (values ('Mother', v_s.mother_info), ('Father', v_s.father_info), ('Guardian', v_s.guardian_info)) as x(label, info)
    where jsonb_typeof(x.info) = 'object' and nullif(btrim(coalesce(x.info ->> 'phone', '')), '') is not null
  ) q;
  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (auth.uid(), public.current_staff_role()::text, 'call_list_viewed', null,
          jsonb_build_object('student_id', p_student_id));
  return v_list;
end;
$$;

-- In-app "still at school" notice to every guardian; returns the notice id so the
-- notify-late-pickup edge function can also email (budget permitting).
create or replace function public.notify_parent_late(p_student_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_id bigint;
  v_guardian uuid;
  v_name text;
  v_phone text;
begin
  perform private.require_verified_gate_staff();
  if not exists (select 1 from public.students where id = p_student_id and status::text = 'Active') then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from private.late_notices
             where student_id = p_student_id and day = v_today and sent_at > now() - interval '10 minutes') then
    return jsonb_build_object('error', 'too_soon');
  end if;
  insert into private.late_notices (student_id, day, sent_by) values (p_student_id, v_today, auth.uid())
  returning id into v_id;
  v_name := private.student_display_name(p_student_id);
  select contact_phone into v_phone from public.school_settings limit 1;
  for v_guardian in select guardian_id from public.student_guardians where student_id = p_student_id loop
    perform private.notify(v_guardian, 'late_pickup',
      v_name || ' is still at school',
      v_name || ' has not been picked up yet (' || private.manila_time(now()) || '). Please come to the school or call the school'
        || coalesce(' at ' || nullif(btrim(v_phone), ''), '') || ' to arrange the pickup.');
  end loop;
  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (auth.uid(), public.current_staff_role()::text, 'late_pickup_notice', null,
          jsonb_build_object('student_id', p_student_id, 'notice_id', v_id));
  return jsonb_build_object('ok', true, 'notice_id', v_id);
end;
$$;

-- Absent today / handed over to staff on duty / left another way.
create or replace function public.set_student_day_status(p_student_id text, p_status text, p_staff_name text, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  perform private.require_verified_gate_staff();
  if p_status not in ('absent', 'handed_over', 'other_exit') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  if p_status = 'handed_over' and coalesce(btrim(p_staff_name), '') = '' then
    return jsonb_build_object('error', 'staff_required');
  end if;
  if p_status = 'other_exit' and coalesce(btrim(p_note), '') = '' then
    return jsonb_build_object('error', 'note_required');
  end if;
  if not exists (select 1 from public.students where id = p_student_id and status::text = 'Active') then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.pickup_logs where student_id = p_student_id
             and (scanned_at at time zone 'Asia/Manila')::date = v_today) then
    return jsonb_build_object('error', 'already_left');
  end if;
  insert into private.dismissal_student_status (student_id, day, status, staff_name, note, recorded_by)
  values (p_student_id, v_today, p_status, nullif(left(btrim(coalesce(p_staff_name, '')), 120), ''),
          nullif(left(btrim(coalesce(p_note, '')), 300), ''), auth.uid())
  on conflict (student_id, day) do update
    set status = excluded.status, staff_name = excluded.staff_name, note = excluded.note,
        recorded_by = excluded.recorded_by, recorded_at = now();
  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (auth.uid(), public.current_staff_role()::text, 'dismissal_status_' || p_status, null,
          jsonb_build_object('student_id', p_student_id, 'staff_name', nullif(btrim(coalesce(p_staff_name, '')), ''),
                             'note', nullif(btrim(coalesce(p_note, '')), '')));
  if p_status = 'handed_over' then
    perform private.notify(sg.guardian_id, 'late_pickup',
      private.student_display_name(p_student_id) || ' is waiting with school staff',
      private.student_display_name(p_student_id) || ' is waiting at school with ' || btrim(p_staff_name)
        || ' (staff on duty). Please come to pick them up.')
    from public.student_guardians sg where sg.student_id = p_student_id;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.clear_student_day_status(p_student_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_verified_gate_staff();
  delete from private.dismissal_student_status
  where student_id = p_student_id and day = (now() at time zone 'Asia/Manila')::date;
  if found then
    insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
    values (auth.uid(), public.current_staff_role()::text, 'dismissal_status_cleared', null,
            jsonb_build_object('student_id', p_student_id));
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Close the day: refused while any student is still on campus and not handed over.
create or replace function public.close_dismissal_day(p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_summary jsonb;
  v_open integer;
begin
  perform private.require_verified_gate_staff();
  if exists (select 1 from private.dismissal_days where day = v_today) then
    return jsonb_build_object('error', 'already_closed');
  end if;
  select jsonb_object_agg(state, cnt) into v_summary
  from (select state, count(*) as cnt from private.campus_rows(v_today) group by state) t;
  v_open := coalesce((v_summary ->> 'on_campus')::integer, 0);
  if v_open > 0 then
    return jsonb_build_object('error', 'unaccounted', 'count', v_open);
  end if;
  insert into private.dismissal_days (day, closed_by, summary, note)
  values (v_today, auth.uid(), coalesce(v_summary, '{}'::jsonb), nullif(left(btrim(coalesce(p_note, '')), 300), ''));
  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (auth.uid(), public.current_staff_role()::text, 'dismissal_day_closed', null,
          jsonb_build_object('day', v_today, 'summary', coalesce(v_summary, '{}'::jsonb)));
  return jsonb_build_object('ok', true, 'summary', coalesce(v_summary, '{}'::jsonb));
end;
$$;

-- ─── for the notify-late-pickup edge function only (service role) ───
-- Claims a notice sent by this staff member in the last 10 minutes (emailed once) and returns
-- the guardians' email addresses.
create or replace function public.claim_late_notice_email(p_notice_id bigint, p_staff_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_n record;
  v_emails jsonb;
  v_phone text;
begin
  update private.late_notices set emailed_at = now()
  where id = p_notice_id and sent_by = p_staff_id and emailed_at is null and sent_at > now() - interval '10 minutes'
  returning student_id into v_n;
  if not found then
    return null;
  end if;
  select coalesce(jsonb_agg(distinct g.email), '[]'::jsonb) into v_emails
  from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
  where sg.student_id = v_n.student_id and nullif(btrim(coalesce(g.email, '')), '') is not null;
  select contact_phone into v_phone from public.school_settings limit 1;
  return jsonb_build_object('emails', v_emails, 'student_name', private.student_display_name(v_n.student_id),
                            'school_phone', nullif(btrim(coalesce(v_phone, '')), ''),
                            'when', private.manila_time(now()));
end;
$$;
revoke execute on function public.claim_late_notice_email(bigint, uuid) from public, anon, authenticated;
grant  execute on function public.claim_late_notice_email(bigint, uuid) to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'public.campus_status_today()', 'public.student_call_list(text)', 'public.notify_parent_late(text)',
    'public.set_student_day_status(text, text, text, text)', 'public.clear_student_day_status(text)',
    'public.close_dismissal_day(text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

commit;

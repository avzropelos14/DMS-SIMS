-- Rollback for 20261117010000_dismissal_schedule.sql
-- Back to one dismissal a day and no no-class days: the functions below are restored exactly as
-- they were before; the schedule settings, no-class days and helpers are removed.

begin;

create or replace function public.get_pickup_settings()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.mfa_ok() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'self_dismissal_min_grade', coalesce(private.pickup_setting('self_dismissal_min_grade'), '7')::integer,
    'late_pickup_time', coalesce(private.pickup_setting('late_pickup_time'), '17:00')
  );
end;
$$;

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
    'closed_by', (select e.full_name from public.employees e join public.profiles p on p.employee_id = e.id
                  where p.id = v_closed.closed_by),
    'students', coalesce((select jsonb_agg(to_jsonb(r) order by r.grade_level, r.student_name)
                          from private.campus_rows(v_today) r), '[]'::jsonb)
  );
end;
$$;

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

create or replace function public.confirm_self_dismissal(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_p record;
  v_now_local timestamp := now() at time zone 'Asia/Manila';
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_log uuid;
begin
  perform private.require_verified_guard();
  select p.*, s.status::text as student_status into v_p
  from private.self_dismissal_permissions p join public.students s on s.id = p.student_id
  where p.id = p_id;
  if not found or v_p.status <> 'active' or v_today not between v_p.valid_from and v_p.valid_to
     or v_p.student_status <> 'Active' then
    return jsonb_build_object('error', 'not_valid_today');
  end if;
  if not exists (select 1 from public.student_guardians sg
                 where sg.guardian_id = v_p.guardian_id and sg.student_id = v_p.student_id and sg.access_status = 'active') then
    return jsonb_build_object('error', 'suspended');
  end if;
  if v_now_local::time < v_p.earliest_release_time then
    return jsonb_build_object('error', 'too_early', 'earliest', to_char(v_p.earliest_release_time, 'FMHH12:MI AM'));
  end if;
  if exists (select 1 from public.pickup_logs l
             where l.student_id = v_p.student_id and (l.scanned_at at time zone 'Asia/Manila')::date = v_today)
     and not exists (select 1 from private.pickup_day_overrides o
                     where o.student_id = v_p.student_id and o.day = v_today and o.used_at is null) then
    return jsonb_build_object('error', 'already_left');
  end if;

  insert into public.pickup_logs
    (student_id, school_year_id, method, guardian_id, picked_up_by_name, relationship, scanned_by, notes)
  values
    (v_p.student_id, (select id from public.school_years where is_current limit 1), 'self_dismissal',
     v_p.guardian_id, 'Self-dismissal', null, public.current_employee_id(),
     'Travel: ' || v_p.travel_mode || coalesce(' (' || v_p.travel_note || ')', ''))
  returning id into v_log;
  update private.pickup_day_overrides set used_at = now()
  where student_id = v_p.student_id and day = v_today and used_at is null;
  return jsonb_build_object('ok', true, 'log_id', v_log);
end;
$$;

-- The scan lookup as in 20261116010000 (already picked up = any pickup today).
create or replace function private.pickup_qr_lookup(p_qr text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_json jsonb;
  v_secret text;
  v_link record;
  v_auth record;
  v_student record;
  v_prev_at timestamptz;
  v_prev_by text;
  v_kind text;
  v_status text := 'ok';
  v_guardian_name text;
  v_relationship text;
  v_guardian_id uuid;
  v_guardian_photo text;
  v_link_id uuid;
  v_auth_id text;
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  begin
    v_json := p_qr::jsonb;
  exception when others then
    return jsonb_build_object('status', 'invalid_code');
  end;
  if jsonb_typeof(v_json) <> 'object' then
    return jsonb_build_object('status', 'invalid_code');
  end if;
  if v_json ? 'type' and not v_json ? 'v' then
    return jsonb_build_object('status', 'legacy_qr');
  end if;
  if (v_json ->> 'v') is distinct from '2' or coalesce(v_json ->> 's', '') = '' then
    return jsonb_build_object('status', 'invalid_code');
  end if;
  v_secret := v_json ->> 's';

  select sg.id, sg.student_id, sg.guardian_id, sg.relationship, sg.access_status, sg.can_pickup,
         g.full_name, case when g.photo_status = 'approved' then g.photo_path end as photo_path
    into v_link
  from private.pickup_qr_secrets ps
  join public.student_guardians sg on sg.id = ps.student_guardian_id
  join public.guardians g on g.id = sg.guardian_id
  where ps.secret = v_secret;

  if found then
    v_kind := 'permanent';
    if not coalesce(v_link.can_pickup, true) then
      return jsonb_build_object('status', 'pickup_not_allowed');
    end if;
    if v_link.access_status = 'suspended' then v_status := 'suspended'; end if;
    v_guardian_name := v_link.full_name;
    v_relationship := v_link.relationship;
    v_guardian_id := v_link.guardian_id;
    v_guardian_photo := v_link.photo_path;
    v_link_id := v_link.id;
    select s.id, s.first_name, s.last_name, s.grade_level, s.status, s.photo_path into v_student
    from public.students s where s.id = v_link.student_id;
  else
    select pa.id, pa.student_id, pa.authorized_by, pa.guardian_name, pa.relationship, pa.valid_until, pa.status,
           pa.photo_path
      into v_auth
    from public.pickup_authorizations pa
    where pa.qr_token = v_secret;
    if not found then
      return jsonb_build_object('status', 'unknown_code');
    end if;
    v_kind := 'temporary';
    if v_auth.status is distinct from 'active' then
      return jsonb_build_object('status', 'authorization_revoked');
    end if;
    if v_auth.valid_until < now() then
      return jsonb_build_object('status', 'authorization_expired');
    end if;
    if exists (select 1 from public.student_guardians sg
               where sg.guardian_id = v_auth.authorized_by and sg.student_id = v_auth.student_id
                 and sg.access_status = 'suspended') then
      v_status := 'suspended';
    end if;
    v_guardian_name := v_auth.guardian_name;
    v_relationship := v_auth.relationship;
    v_guardian_photo := v_auth.photo_path;
    v_auth_id := v_auth.id;
    select s.id, s.first_name, s.last_name, s.grade_level, s.status, s.photo_path into v_student
    from public.students s where s.id = v_auth.student_id;
  end if;

  if v_student.id is null or v_student.status::text is distinct from 'Active' then
    return jsonb_build_object('status', 'student_inactive');
  end if;

  if v_status = 'ok' then
    select l.scanned_at, l.picked_up_by_name into v_prev_at, v_prev_by
    from public.pickup_logs l
    where l.student_id = v_student.id
      and (l.scanned_at at time zone 'Asia/Manila')::date = v_today
    order by l.scanned_at desc limit 1;
    if found and not exists (select 1 from private.pickup_day_overrides o
                             where o.student_id = v_student.id and o.day = v_today and o.used_at is null) then
      v_status := 'already_picked_up';
    end if;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'kind', v_kind,
    'student_id', v_student.id,
    'student_name', v_student.first_name || ' ' || v_student.last_name,
    'grade_level', v_student.grade_level,
    'student_photo_path', v_student.photo_path,
    'guardian_name', v_guardian_name,
    'relationship', v_relationship,
    'guardian_id', v_guardian_id,
    'guardian_photo_path', v_guardian_photo,
    'link_id', v_link_id,
    'auth_id', v_auth_id,
    'previous_pickup_at', v_prev_at,
    'previous_pickup_by', v_prev_by
  );
end;
$$;

-- The SMS claim as in 20261116030000 (no closure texts).
create or replace function public.claim_event_sms(p_kind text, p_ref text, p_caller uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row record;
  v_guardian uuid;
  v_student text;
  v_recipients jsonb := '[]'::jsonb;
  v_g record;
  v_log bigint;
  v_phone text;
  v_school_phone text;
  v_n jsonb;
begin
  select nullif(btrim(coalesce(contact_phone, '')), '') into v_school_phone from public.school_settings limit 1;

  if p_kind = 'pickup_rejected' then
    if p_ref !~ '^[0-9]{1,18}$' then return null; end if;
    select id, actor_id, created_at, target_user_id, details into v_row
    from public.audit_log where id = p_ref::bigint and action = 'pickup_rejected';
    if not found or v_row.actor_id is distinct from p_caller
       or v_row.created_at < now() - interval '10 minutes' then
      return null;
    end if;
    v_guardian := v_row.target_user_id;
    if v_guardian is null and (v_row.details ->> 'auth_id') is not null then
      select authorized_by into v_guardian from public.pickup_authorizations where id = v_row.details ->> 'auth_id';
    end if;
    v_student := v_row.details ->> 'student_id';
    select private.ph_mobile(phone) into v_phone from public.guardians where id = v_guardian;
    if v_phone is not null then
      v_log := private.sms_claim(p_kind, p_ref, v_guardian);
      if v_log is not null then
        v_recipients := jsonb_build_array(jsonb_build_object('log_id', v_log, 'phone', v_phone));
      end if;
    end if;
    return jsonb_build_object('recipients', v_recipients,
      'student_name', private.student_display_name(v_student),
      'when', to_char(v_row.created_at at time zone 'Asia/Manila', 'FMHH12:MI AM'),
      'school_phone', v_school_phone);

  elsif p_kind = 'late_pickup' then
    if p_ref !~ '^[0-9]{1,18}$' then return null; end if;
    select student_id into v_student from private.late_notices
    where id = p_ref::bigint and sent_by = p_caller and sent_at > now() - interval '10 minutes';
    if not found then return null; end if;
    for v_g in
      select distinct on (private.ph_mobile(g.phone)) g.id, private.ph_mobile(g.phone) as phone
      from private.late_batch_students(p_ref::bigint) b
      join public.student_guardians sg on sg.student_id = b.student_id
      join public.guardians g on g.id = sg.guardian_id
      where private.ph_mobile(g.phone) is not null
    loop
      v_log := private.sms_claim(p_kind, p_ref, v_g.id);
      if v_log is not null then
        v_n := private.late_batch_names_for(p_ref::bigint, v_g.id);
        v_recipients := v_recipients || jsonb_build_object('log_id', v_log, 'phone', v_g.phone,
                                                           'student_name', v_n ->> 'names', 'count', (v_n ->> 'count')::int);
      end if;
    end loop;
    return jsonb_build_object('recipients', v_recipients,
      'student_name', private.student_display_name(v_student),
      'when', to_char(now() at time zone 'Asia/Manila', 'FMHH12:MI AM'),
      'school_phone', v_school_phone);

  elsif p_kind = 'test' then
    select private.ph_mobile(e.phone) into v_phone
    from public.profiles p join public.employees e on e.id::text = p.employee_id
    where p.id = p_caller and p.role::text = 'full_admin';
    if not found then return null; end if;
    if v_phone is null then return jsonb_build_object('recipients', '[]'::jsonb, 'no_phone', true); end if;
    v_log := private.sms_claim(p_kind, extract(epoch from now())::bigint::text, p_caller);
    return jsonb_build_object('recipients', jsonb_build_array(jsonb_build_object('log_id', v_log, 'phone', v_phone)));
  end if;
  return null;
end;
$$;

drop function if exists public.set_dismissal_schedule(text, text, text, text[], boolean);
drop function if exists public.declare_no_classes(date, text, text);
drop function if exists public.cancel_no_classes(date);
drop function if exists public.list_no_class_days();
drop function if exists private.can_leave_again(text);
drop function if exists private.returns_after_lunch(text, timestamptz);
drop function if exists private.is_half_day_grade(text);
drop function if exists private.dismissal_session(timestamptz);
drop function if exists private.setting_minutes(text, text);
drop function if exists private.manila_minutes(timestamptz);
drop function if exists private.school_day_status(date);
drop function if exists private.hhmm_minutes(text);
drop table if exists private.no_class_days;
delete from private.pickup_settings where key in ('day_start_time', 'lunch_dismissal_time', 'afternoon_dismissal_time', 'half_day_grades', 'saturday_classes');

commit;

-- Two dismissals a day (lunch and afternoon) and a set start of the school day.
--   * Day starts at 07:00: before that the guard's Students on Campus shows "not started".
--   * Lunch dismissal from 11:30, afternoon dismissal from 16:00 (late pickup stays 17:00).
--   * "Half-day" grades (chosen in System Settings) go home for good when picked up at lunch.
--     Anyone else picked up during the lunch window is "out for lunch" and expected back: from
--     the afternoon dismissal they count as on campus again and can be picked up a second time.
--   * A pickup before the lunch window (sent home early) or from the afternoon dismissal is the
--     end of the day, as before. Closing the day waits for the afternoon dismissal.
--   * No-class days: Sundays always; Saturdays unless Saturday classes are switched on; and days
--     the admin or registrar declares (typhoon, holiday). A declaration can instead suspend
--     classes from a time of day: the afternoon dismissal then starts at that time and nobody
--     out for lunch is expected back. Parents get an in-app notice; the send-event-sms function
--     texts them (kind 'closure').
-- Times are Philippine time. Additive. Rollback: supabase/rollbacks/20261117010000_dismissal_schedule.sql

begin;

insert into private.pickup_settings (key, value, updated_at) values
  ('day_start_time', '07:00', now()),
  ('lunch_dismissal_time', '11:30', now()),
  ('afternoon_dismissal_time', '16:00', now()),
  ('half_day_grades', '', now()),
  ('saturday_classes', 'false', now())
on conflict (key) do nothing;

-- Days without classes declared by the office. from_time null = the whole day; otherwise
-- classes are suspended from that time (students already at school are dismissed then).
create table if not exists private.no_class_days (
  day date primary key,
  from_time time,
  reason text not null,
  declared_by uuid,
  declared_at timestamptz not null default now()
);
alter table private.no_class_days enable row level security;
revoke all on private.no_class_days from public, anon, authenticated;

-- ─── helpers ───
-- Minutes after midnight, Philippine time.
create or replace function private.manila_minutes(p_at timestamptz)
returns integer language sql stable set search_path = '' as $$
  select (extract(hour from (p_at at time zone 'Asia/Manila')) * 60
        + extract(minute from (p_at at time zone 'Asia/Manila')))::integer;
$$;

create or replace function private.setting_minutes(p_key text, p_default text)
returns integer language sql stable security definer set search_path = '' as $$
  select split_part(v, ':', 1)::integer * 60 + split_part(v, ':', 2)::integer
  from (select coalesce(private.pickup_setting(p_key), p_default) as v) x;
$$;

create or replace function private.hhmm_minutes(p_hhmm text)
returns integer language sql immutable set search_path = '' as $$
  select split_part(p_hhmm, ':', 1)::integer * 60 + split_part(p_hhmm, ':', 2)::integer;
$$;

-- Whether a date has classes: { school_day, kind (weekend | declared | suspended), reason, suspended_from }.
create or replace function private.school_day_status(p_day date)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case
    when d.day is not null and d.from_time is null then
      jsonb_build_object('school_day', false, 'kind', 'declared', 'reason', d.reason)
    when extract(isodow from p_day) = 7
         or (extract(isodow from p_day) = 6 and coalesce(private.pickup_setting('saturday_classes'), 'false') <> 'true') then
      jsonb_build_object('school_day', false, 'kind', 'weekend',
                         'reason', case when extract(isodow from p_day) = 6 then 'Saturday' else 'Sunday' end)
    when d.day is not null then
      jsonb_build_object('school_day', true, 'kind', 'suspended', 'reason', d.reason,
                         'suspended_from', to_char(d.from_time, 'HH24:MI'))
    else jsonb_build_object('school_day', true)
  end
  from (select p_day as day0) p
  left join private.no_class_days d on d.day = p_day;
$$;

-- no_classes | not_started | morning | lunch | afternoon (a suspension starts the afternoon
-- dismissal at its time).
create or replace function private.dismissal_session(p_at timestamptz)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when not coalesce((st ->> 'school_day')::boolean, true) then 'no_classes'
    when st ->> 'suspended_from' is not null and m >= private.hhmm_minutes(st ->> 'suspended_from') then 'afternoon'
    when m < private.setting_minutes('day_start_time', '07:00') then 'not_started'
    when m < private.setting_minutes('lunch_dismissal_time', '11:30') then 'morning'
    when m < private.setting_minutes('afternoon_dismissal_time', '16:00') then 'lunch'
    else 'afternoon' end
  from (select private.manila_minutes(p_at) as m,
               private.school_day_status((p_at at time zone 'Asia/Manila')::date) as st) x;
$$;

create or replace function private.is_half_day_grade(p_grade text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(btrim(p_grade), '') <> ''
     and btrim(p_grade) = any (select btrim(g) from unnest(string_to_array(coalesce(private.pickup_setting('half_day_grades'), ''), ',')) g);
$$;

-- A pickup in the lunch window of a student who isn't in a half-day grade: out for lunch.
-- Not on a day classes were suspended (nobody is expected back).
create or replace function private.returns_after_lunch(p_student_id text, p_scanned_at timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.dismissal_session(p_scanned_at) = 'lunch'
     and not private.is_half_day_grade((select grade_level from public.students where id = p_student_id))
     and (private.school_day_status((p_scanned_at at time zone 'Asia/Manila')::date) ->> 'suspended_from') is null;
$$;

-- True when the student's last exit today was "out for lunch" and the afternoon dismissal has
-- begun, so they may be picked up (or marked) again.
create or replace function private.can_leave_again(p_student_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select private.returns_after_lunch(p_student_id, l.scanned_at)
    from public.pickup_logs l
    where l.student_id = p_student_id
      and (l.scanned_at at time zone 'Asia/Manila')::date = (now() at time zone 'Asia/Manila')::date
    order by l.scanned_at desc limit 1), false)
    and private.dismissal_session(now()) = 'afternoon';
$$;

revoke execute on function private.manila_minutes(timestamptz) from public, anon, authenticated;
revoke execute on function private.setting_minutes(text, text) from public, anon, authenticated;
revoke execute on function private.dismissal_session(timestamptz) from public, anon, authenticated;
revoke execute on function private.hhmm_minutes(text) from public, anon, authenticated;
revoke execute on function private.school_day_status(date) from public, anon, authenticated;
revoke execute on function private.is_half_day_grade(text) from public, anon, authenticated;
revoke execute on function private.returns_after_lunch(text, timestamptz) from public, anon, authenticated;
revoke execute on function private.can_leave_again(text) from public, anon, authenticated;

-- ─── settings ───
create or replace function public.get_pickup_settings()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.mfa_ok() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'self_dismissal_min_grade', coalesce(private.pickup_setting('self_dismissal_min_grade'), '7')::integer,
    'late_pickup_time', coalesce(private.pickup_setting('late_pickup_time'), '17:00'),
    'day_start_time', coalesce(private.pickup_setting('day_start_time'), '07:00'),
    'lunch_dismissal_time', coalesce(private.pickup_setting('lunch_dismissal_time'), '11:30'),
    'afternoon_dismissal_time', coalesce(private.pickup_setting('afternoon_dismissal_time'), '16:00'),
    'half_day_grades', to_jsonb(array_remove(string_to_array(coalesce(private.pickup_setting('half_day_grades'), ''), ','), '')),
    'saturday_classes', coalesce(private.pickup_setting('saturday_classes'), 'false') = 'true'
  );
end;
$$;

-- Full admin: the day's schedule, the half-day grades, and Saturday classes.
create or replace function public.set_dismissal_schedule(
  p_day_start text, p_lunch text, p_afternoon text, p_half_day_grades text[], p_saturday_classes boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_re text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  v_grades text[] := coalesce(p_half_day_grades, '{}');
  v_g text;
  v_late text := coalesce(private.pickup_setting('late_pickup_time'), '17:00');
begin
  perform private.require_verified_admin();
  if p_day_start !~ v_re or p_lunch !~ v_re or p_afternoon !~ v_re then
    return jsonb_build_object('error', 'invalid_time');
  end if;
  if not (p_day_start < p_lunch and p_lunch < p_afternoon) then
    return jsonb_build_object('error', 'out_of_order');
  end if;
  if p_afternoon > v_late then
    return jsonb_build_object('error', 'after_late_time');
  end if;
  foreach v_g in array v_grades loop
    if v_g !~ '^(Kinder [12]|Grade ([1-9]|1[0-2]))$' then
      return jsonb_build_object('error', 'invalid_grade');
    end if;
  end loop;
  update private.pickup_settings set value = p_day_start, updated_at = now(), updated_by = auth.uid() where key = 'day_start_time';
  update private.pickup_settings set value = p_lunch, updated_at = now(), updated_by = auth.uid() where key = 'lunch_dismissal_time';
  update private.pickup_settings set value = p_afternoon, updated_at = now(), updated_by = auth.uid() where key = 'afternoon_dismissal_time';
  update private.pickup_settings set value = array_to_string(v_grades, ','), updated_at = now(), updated_by = auth.uid() where key = 'half_day_grades';
  update private.pickup_settings set value = case when coalesce(p_saturday_classes, false) then 'true' else 'false' end,
         updated_at = now(), updated_by = auth.uid() where key = 'saturday_classes';
  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (auth.uid(), 'full_admin', 'dismissal_schedule_changed', null,
          jsonb_build_object('day_start_time', p_day_start, 'lunch_dismissal_time', p_lunch,
                             'afternoon_dismissal_time', p_afternoon, 'half_day_grades', to_jsonb(v_grades),
                             'saturday_classes', coalesce(p_saturday_classes, false)));
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.set_dismissal_schedule(text, text, text, text[], boolean) from public, anon;
grant execute on function public.set_dismissal_schedule(text, text, text, text[], boolean) to authenticated;

-- ─── each student's state today (adds out_for_lunch, and back from lunch) ───
create or replace function private.campus_rows(p_day date)
returns table (student_id text, student_name text, grade_level text, section text, photo_path text,
               state text, state_at timestamptz, detail text, last_notice_at timestamptz, notices integer)
language sql stable security definer set search_path = '' as $$
  select s.id,
         s.first_name || ' ' || s.last_name,
         s.grade_level, s.section, s.photo_path,
         case when l.id is not null and l.lunch and not x.afternoon then 'out_for_lunch'
              when l.id is not null and l.lunch then
                case when d.status is not null and d.recorded_at > l.scanned_at then d.status else 'on_campus' end
              when l.method = 'self_dismissal' then 'self_dismissed'
              when l.id is not null then 'picked_up'
              else coalesce(d.status, 'on_campus') end,
         case when l.id is not null and l.lunch and x.afternoon then
                case when d.status is not null and d.recorded_at > l.scanned_at then d.recorded_at end
              else coalesce(l.scanned_at, d.recorded_at) end,
         case when l.id is not null and l.lunch and x.afternoon then
                case when d.status is not null and d.recorded_at > l.scanned_at
                     then case when d.status = 'handed_over' then d.staff_name || coalesce(' · ' || d.note, '') else d.note end
                     else 'Back from lunch (out at ' || to_char(l.scanned_at at time zone 'Asia/Manila', 'FMHH12:MI AM') || ')' end
              when l.id is not null then l.picked_up_by_name
              when d.status = 'handed_over' then d.staff_name || coalesce(' · ' || d.note, '')
              else d.note end,
         n.last_at, coalesce(n.cnt, 0)::integer
  from public.students s
  cross join (select private.dismissal_session(now()) = 'afternoon' as afternoon) x
  left join lateral (
    select pl.id, pl.method, pl.scanned_at, pl.picked_up_by_name,
           private.returns_after_lunch(s.id, pl.scanned_at) as lunch
    from public.pickup_logs pl
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
    'session', private.dismissal_session(now()),
    'school_day', private.school_day_status(v_today),
    'late_pickup_time', coalesce(private.pickup_setting('late_pickup_time'), '17:00'),
    'day_start_time', coalesce(private.pickup_setting('day_start_time'), '07:00'),
    'lunch_dismissal_time', coalesce(private.pickup_setting('lunch_dismissal_time'), '11:30'),
    'afternoon_dismissal_time', coalesce(private.pickup_setting('afternoon_dismissal_time'), '16:00'),
    'half_day_grades', to_jsonb(array_remove(string_to_array(coalesce(private.pickup_setting('half_day_grades'), ''), ','), '')),
    'closed_at', v_closed.closed_at,
    'closed_by', (select e.full_name from public.employees e join public.profiles p on p.employee_id = e.id
                  where p.id = v_closed.closed_by),
    'students', coalesce((select jsonb_agg(to_jsonb(r) order by r.grade_level, r.student_name)
                          from private.campus_rows(v_today) r), '[]'::jsonb)
  );
end;
$$;

-- Closing waits for the afternoon dismissal; students out for lunch are still unaccounted.
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
  if private.dismissal_session(now()) <> 'afternoon' then
    return jsonb_build_object('error', 'too_early',
                              'afternoon', coalesce(private.pickup_setting('afternoon_dismissal_time'), '16:00'));
  end if;
  select jsonb_object_agg(state, cnt) into v_summary
  from (select state, count(*) as cnt from private.campus_rows(v_today) group by state) t;
  v_open := coalesce((v_summary ->> 'on_campus')::integer, 0) + coalesce((v_summary ->> 'out_for_lunch')::integer, 0);
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

-- Marking a student (absent / with staff / other) is allowed again once they're back from lunch.
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
             and (scanned_at at time zone 'Asia/Manila')::date = v_today)
     and not private.can_leave_again(p_student_id) then
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

-- Self-dismissal: a second release is allowed once the student is back from lunch.
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
     and not private.can_leave_again(v_p.student_id)
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

-- The guard's scan: "already picked up" no longer applies to a student back from lunch.
-- Same as 20261116010000 otherwise.
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
    if found and not private.can_leave_again(v_student.id)
       and not exists (select 1 from private.pickup_day_overrides o
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


-- ─── no-class days (admin and registrar) ───
-- Declare (or change) a no-class day for today or a later date, or a suspension from a time.
-- Every parent of an active student gets an in-app notice; the caller then asks
-- send-event-sms (kind 'closure', ref = the date) to text them.
create or replace function public.declare_no_classes(p_day date, p_from_time text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_from time;
  v_title text;
  v_body text;
  v_count integer := 0;
  v_g uuid;
begin
  perform private.require_verified_office();
  if p_day is null or p_day < v_today or p_day > v_today + 366 then
    return jsonb_build_object('error', 'invalid_date');
  end if;
  if length(v_reason) < 3 or length(v_reason) > 120 then
    return jsonb_build_object('error', 'invalid_reason');
  end if;
  if nullif(btrim(coalesce(p_from_time, '')), '') is not null then
    if p_from_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      return jsonb_build_object('error', 'invalid_time');
    end if;
    v_from := p_from_time::time;
  end if;

  insert into private.no_class_days (day, from_time, reason, declared_by, declared_at)
  values (p_day, v_from, v_reason, auth.uid(), now())
  on conflict (day) do update
    set from_time = excluded.from_time, reason = excluded.reason,
        declared_by = excluded.declared_by, declared_at = excluded.declared_at;

  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (auth.uid(), public.current_staff_role()::text,
          case when v_from is null then 'no_classes_declared' else 'classes_suspended' end, null,
          jsonb_build_object('day', p_day, 'from_time', to_char(v_from, 'HH24:MI'), 'reason', v_reason));

  if v_from is null then
    v_title := 'No classes on ' || to_char(p_day, 'FMDay, Mon FMDD');
    v_body := 'There are no classes on ' || to_char(p_day, 'FMDay, FMMonth FMDD') || ': ' || v_reason || '.';
  else
    v_title := 'Classes suspended ' || case when p_day = v_today then 'today' else 'on ' || to_char(p_day, 'Mon FMDD') end
               || ' from ' || to_char(v_from, 'FMHH12:MI AM');
    v_body := 'Classes ' || case when p_day = v_today then 'today' else 'on ' || to_char(p_day, 'FMDay, FMMonth FMDD') end
              || ' are suspended from ' || to_char(v_from, 'FMHH12:MI AM') || ': ' || v_reason
              || '. Please pick up your child from that time.';
  end if;
  for v_g in
    select distinct sg.guardian_id from public.student_guardians sg
    join public.students s on s.id = sg.student_id and s.status::text = 'Active'
  loop
    perform private.notify(v_g, 'school_closure', v_title, v_body);
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('ok', true, 'notified', v_count);
end;
$$;

-- Cancel a declaration (classes go ahead as normal). Parents get an in-app notice only.
create or replace function public.cancel_no_classes(p_day date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row record;
  v_g uuid;
begin
  perform private.require_verified_office();
  delete from private.no_class_days where day = p_day
    and day >= (now() at time zone 'Asia/Manila')::date
  returning * into v_row;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (auth.uid(), public.current_staff_role()::text, 'no_classes_cancelled', null,
          jsonb_build_object('day', p_day, 'reason', v_row.reason));
  for v_g in
    select distinct sg.guardian_id from public.student_guardians sg
    join public.students s on s.id = sg.student_id and s.status::text = 'Active'
  loop
    perform private.notify(v_g, 'school_closure',
      'Classes on ' || to_char(p_day, 'FMDay, Mon FMDD') || ' go ahead',
      'The earlier notice is cancelled: classes on ' || to_char(p_day, 'FMDay, FMMonth FMDD') || ' go ahead as normal.');
  end loop;
  return jsonb_build_object('ok', true);
end;
$$;

-- The office's list: declarations from 30 days ago onward, newest date first.
create or replace function public.list_no_class_days()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_verified_office();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'day', d.day, 'from_time', to_char(d.from_time, 'HH24:MI'), 'reason', d.reason,
             'declared_at', d.declared_at,
             'declared_by', (select coalesce(e.full_name, p.full_name) from public.profiles p
                             left join public.employees e on e.id::text = p.employee_id where p.id = d.declared_by))
           order by d.day desc)
    from private.no_class_days d
    where d.day >= (now() at time zone 'Asia/Manila')::date - 30), '[]'::jsonb);
end;
$$;

revoke execute on function public.declare_no_classes(date, text, text) from public, anon;
revoke execute on function public.cancel_no_classes(date) from public, anon;
revoke execute on function public.list_no_class_days() from public, anon;
grant execute on function public.declare_no_classes(date, text, text) to authenticated;
grant execute on function public.cancel_no_classes(date) to authenticated;
grant execute on function public.list_no_class_days() to authenticated;

-- SMS claim: same as 20261116030000, plus kind 'closure' (ref = the date, YYYY-MM-DD): the
-- office member who just declared it texts each parent of an active student once.
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
  v_c record;
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

  elsif p_kind = 'closure' then
    if p_ref !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null; end if;
    select * into v_c from private.no_class_days
    where day = p_ref::date and declared_by = p_caller and declared_at > now() - interval '10 minutes';
    if not found then return null; end if;
    for v_g in
      select distinct on (private.ph_mobile(g.phone)) g.id, private.ph_mobile(g.phone) as phone
      from public.student_guardians sg
      join public.students s on s.id = sg.student_id and s.status::text = 'Active'
      join public.guardians g on g.id = sg.guardian_id
      where private.ph_mobile(g.phone) is not null
    loop
      -- One SMS per parent per declaration (a changed declaration texts again).
      v_log := private.sms_claim(p_kind, p_ref || ':' || extract(epoch from v_c.declared_at)::bigint, v_g.id);
      if v_log is not null then
        v_recipients := v_recipients || jsonb_build_object('log_id', v_log, 'phone', v_g.phone);
      end if;
    end loop;
    return jsonb_build_object('recipients', v_recipients,
      'closure_day', to_char(v_c.day, 'FMDay, Mon FMDD'),
      'closure_today', v_c.day = (now() at time zone 'Asia/Manila')::date,
      'closure_from', to_char(v_c.from_time, 'FMHH12:MI AM'),
      'closure_reason', v_c.reason,
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

commit;

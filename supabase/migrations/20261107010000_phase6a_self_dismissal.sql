-- Phase 6A: self-dismissal permission (a student may leave school on their own).
-- Additive only. Permissions live in the private schema and are read and written only
-- through the functions below:
--   parent    -> request (fresh password check required) / revoke, for linked students only
--   registrar -> approve or deny requests for students below the minimum grade
--   guard     -> today's list, and confirm the student left (logged in pickup_logs)
--   student   -> read-only status badge
-- Rollback: supabase/rollbacks/20261107010000_phase6a_self_dismissal.sql

begin;

-- ─── settings (the admin changes them in System Settings) ───
create table private.pickup_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table private.pickup_settings enable row level security;
revoke all on private.pickup_settings from public, anon, authenticated;
insert into private.pickup_settings (key, value) values
  ('self_dismissal_min_grade', '7'),   -- parent alone may allow from this grade; below: registrar approves
  ('late_pickup_time', '17:00')        -- used by Phase 6B (students still on campus)
on conflict (key) do nothing;

create or replace function private.pickup_setting(p_key text)
returns text language sql stable security definer set search_path = '' as $$
  select value from private.pickup_settings where key = p_key;
$$;
revoke execute on function private.pickup_setting(text) from public, anon, authenticated;

-- "Grade 7" -> 7, "Kinder 1" / "Nursery" / unknown -> 0.
create or replace function private.grade_number(p_grade text)
returns integer language sql immutable set search_path = '' as $$
  select coalesce((regexp_match(coalesce(p_grade, ''), '(?i)^\s*grade\s*(\d+)'))[1]::integer, 0);
$$;
revoke execute on function private.grade_number(text) from public, anon, authenticated;

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

create or replace function public.set_pickup_settings(p_min_grade integer, p_late_time text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_verified_admin();
  -- 13 = "registrar always approves" (no grade reaches it).
  if p_min_grade is null or p_min_grade < 1 or p_min_grade > 13 then
    raise exception 'Invalid grade' using errcode = '22023';
  end if;
  if p_late_time is null or p_late_time !~ '^([01]\d|2[0-3]):[0-5]\d$' then
    raise exception 'Invalid time' using errcode = '22023';
  end if;
  update private.pickup_settings set value = p_min_grade::text, updated_at = now(), updated_by = auth.uid()
  where key = 'self_dismissal_min_grade';
  update private.pickup_settings set value = p_late_time, updated_at = now(), updated_by = auth.uid()
  where key = 'late_pickup_time';
  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (auth.uid(), 'full_admin', 'pickup_settings_changed', null,
          jsonb_build_object('self_dismissal_min_grade', p_min_grade, 'late_pickup_time', p_late_time));
end;
$$;

-- ─── fresh password confirmation (written by the confirm-password edge function) ───
create table private.password_confirmations (
  user_id uuid primary key references auth.users (id) on delete cascade,
  confirmed_at timestamptz not null default now()
);
alter table private.password_confirmations enable row level security;
revoke all on private.password_confirmations from public, anon, authenticated;

create or replace function public.record_password_confirmation(p_user_id uuid)
returns void language sql security definer set search_path = '' as $$
  insert into private.password_confirmations (user_id, confirmed_at) values (p_user_id, now())
  on conflict (user_id) do update set confirmed_at = excluded.confirmed_at;
$$;
revoke execute on function public.record_password_confirmation(uuid) from public, anon, authenticated;
grant  execute on function public.record_password_confirmation(uuid) to service_role;

-- True once, within 5 minutes of the check (the confirmation is used up).
create or replace function private.consume_password_confirmation()
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  delete from private.password_confirmations
  where user_id = auth.uid() and confirmed_at > now() - interval '5 minutes';
  return found;
end;
$$;
revoke execute on function private.consume_password_confirmation() from public, anon, authenticated;

-- ─── permissions ───
create table private.self_dismissal_permissions (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students (id) on delete cascade,
  guardian_id uuid not null references public.guardians (id) on delete cascade,
  valid_from date not null,
  valid_to date not null,
  earliest_release_time time not null,
  travel_mode text not null check (travel_mode in ('walk', 'public_transport', 'bicycle', 'school_service', 'other')),
  travel_note text,
  consent_text_version text not null,
  status text not null check (status in ('pending_approval', 'active', 'denied', 'revoked')),
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  revoked_at timestamptz,
  revoked_by uuid,
  check (valid_to >= valid_from)
);
create index self_dismissal_student_idx on private.self_dismissal_permissions (student_id, valid_to);
alter table private.self_dismissal_permissions enable row level security;
revoke all on private.self_dismissal_permissions from public, anon, authenticated;

alter table public.pickup_logs drop constraint pickup_logs_method_check;
alter table public.pickup_logs add constraint pickup_logs_method_check
  check (method = any (array['qr_persistent', 'qr_authorization', 'manual', 'self_dismissal']));

create or replace function private.self_dismissal_json(p private.self_dismissal_permissions)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'student_id', p.student_id, 'guardian_id', p.guardian_id,
    'guardian_name', (select full_name from public.guardians where id = p.guardian_id),
    'valid_from', p.valid_from, 'valid_to', p.valid_to,
    'earliest_release_time', to_char(p.earliest_release_time, 'HH24:MI'),
    'travel_mode', p.travel_mode, 'travel_note', p.travel_note,
    'status', p.status, 'created_at', p.created_at, 'decision_note', p.decision_note
  );
$$;
revoke execute on function private.self_dismissal_json(private.self_dismissal_permissions) from public, anon, authenticated;

-- Parent: request a permission. Grade >= minimum: active at once; below: waits for the registrar.
create or replace function public.request_self_dismissal(
  p_student_id text, p_valid_from date, p_valid_to date, p_earliest_time text,
  p_travel_mode text, p_travel_note text, p_consent_version text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_grade text;
  v_name text;
  v_status text;
  v_id uuid;
  v_guardian uuid;
begin
  if v_uid is null or not private.mfa_ok() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  -- Linked to the student, with pickup access not suspended (suspended / locked-down
  -- guardians cannot create permissions).
  if not exists (select 1 from public.student_guardians
                 where guardian_id = v_uid and student_id = p_student_id and access_status = 'active') then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  if p_valid_from is null or p_valid_to is null or p_valid_from < v_today or p_valid_to < p_valid_from
     or p_valid_to > p_valid_from + 366 then
    return jsonb_build_object('error', 'invalid_dates');
  end if;
  if p_earliest_time is null or p_earliest_time !~ '^([01]\d|2[0-3]):[0-5]\d$' then
    return jsonb_build_object('error', 'invalid_time');
  end if;
  if p_travel_mode not in ('walk', 'public_transport', 'bicycle', 'school_service', 'other') then
    return jsonb_build_object('error', 'invalid_travel_mode');
  end if;
  if coalesce(btrim(p_consent_version), '') = '' then
    return jsonb_build_object('error', 'consent_required');
  end if;
  if exists (select 1 from private.self_dismissal_permissions
             where student_id = p_student_id and status in ('active', 'pending_approval')
               and valid_to >= p_valid_from and valid_from <= p_valid_to) then
    return jsonb_build_object('error', 'overlapping');
  end if;
  -- Checked last, so a mistake above doesn't use up the password confirmation.
  if not private.consume_password_confirmation() then
    return jsonb_build_object('error', 'password_required');
  end if;

  select grade_level, first_name || ' ' || last_name into v_grade, v_name
  from public.students where id = p_student_id;
  v_status := case
    when private.grade_number(v_grade) >= coalesce(private.pickup_setting('self_dismissal_min_grade'), '7')::integer
      then 'active' else 'pending_approval' end;

  insert into private.self_dismissal_permissions
    (student_id, guardian_id, valid_from, valid_to, earliest_release_time, travel_mode, travel_note,
     consent_text_version, status)
  values
    (p_student_id, v_uid, p_valid_from, p_valid_to, p_earliest_time::time, p_travel_mode,
     nullif(left(btrim(coalesce(p_travel_note, '')), 200), ''), left(p_consent_version, 40), v_status)
  returning id into v_id;

  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (v_uid, 'parent', 'self_dismissal_requested', v_uid,
          jsonb_build_object('permission_id', v_id, 'student_id', p_student_id, 'status', v_status,
                             'valid_from', p_valid_from, 'valid_to', p_valid_to,
                             'earliest_release_time', p_earliest_time, 'consent_version', p_consent_version));

  -- Every guardian of the student is told.
  for v_guardian in select guardian_id from public.student_guardians where student_id = p_student_id loop
    perform private.notify(v_guardian, 'self_dismissal',
      case when v_status = 'active' then 'Self-dismissal allowed for ' || v_name
           else 'Self-dismissal requested for ' || v_name end,
      case when v_status = 'active'
           then v_name || ' may leave school on their own from ' || to_char(p_valid_from, 'Mon FMDD')
                || ' to ' || to_char(p_valid_to, 'Mon FMDD') || ', not before '
                || to_char(p_earliest_time::time, 'FMHH12:MI AM') || '.'
           else 'The request for ' || v_name || ' to leave school on their own waits for the registrar''s approval.' end);
  end loop;

  return jsonb_build_object('id', v_id, 'status', v_status);
end;
$$;

-- Parent: their children's permissions (current and recent).
create or replace function public.my_self_dismissals()
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.mfa_ok() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select private.self_dismissal_json(p) from private.self_dismissal_permissions p
    where p.student_id in (select student_id from public.student_guardians where guardian_id = auth.uid())
      and p.valid_to >= (now() at time zone 'Asia/Manila')::date - 30
    order by p.created_at desc limit 50;
end;
$$;

-- Parent (any guardian of the student) or office: revoke.
create or replace function public.revoke_self_dismissal(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_p record;
  v_guardian uuid;
  v_office boolean := coalesce(public.is_admin_or_registrar(), false);
begin
  if auth.uid() is null or not private.mfa_ok() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select id, student_id, status into v_p from private.self_dismissal_permissions where id = p_id;
  if not found or not (v_office or public.is_guardian_of(v_p.student_id)) then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_p.status not in ('active', 'pending_approval') then
    return jsonb_build_object('error', 'not_active');
  end if;
  update private.self_dismissal_permissions
  set status = 'revoked', revoked_at = now(), revoked_by = auth.uid() where id = p_id;
  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (auth.uid(), coalesce(public.current_staff_role()::text, 'parent'), 'self_dismissal_revoked', null,
          jsonb_build_object('permission_id', p_id, 'student_id', v_p.student_id));
  for v_guardian in select guardian_id from public.student_guardians where student_id = v_p.student_id loop
    perform private.notify(v_guardian, 'self_dismissal_revoked',
      'Self-dismissal cancelled for ' || private.student_display_name(v_p.student_id),
      private.student_display_name(v_p.student_id) || ' must now be picked up by an authorized guardian.');
  end loop;
  return jsonb_build_object('ok', true);
end;
$$;

-- Registrar / admin: requests waiting for approval.
create or replace function public.pending_self_dismissals()
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_verified_office();
  return query
    select private.self_dismissal_json(p) || jsonb_build_object(
             'student_name', s.first_name || ' ' || s.last_name, 'grade_level', s.grade_level)
    from private.self_dismissal_permissions p
    join public.students s on s.id = p.student_id
    where p.status = 'pending_approval'
    order by p.created_at;
end;
$$;

create or replace function public.decide_self_dismissal(p_id uuid, p_approve boolean, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_p record;
begin
  perform private.require_verified_office();
  if not p_approve and coalesce(btrim(p_note), '') = '' then
    raise exception 'A note is required when denying' using errcode = '22023';
  end if;
  select id, student_id, guardian_id into v_p from private.self_dismissal_permissions
  where id = p_id and status = 'pending_approval';
  if not found then
    return jsonb_build_object('error', 'not_pending');
  end if;
  update private.self_dismissal_permissions
  set status = case when p_approve then 'active' else 'denied' end,
      decided_by = auth.uid(), decided_at = now(), decision_note = nullif(left(btrim(coalesce(p_note, '')), 500), '')
  where id = p_id;
  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (auth.uid(), public.current_staff_role()::text,
          case when p_approve then 'self_dismissal_approved' else 'self_dismissal_denied' end,
          v_p.guardian_id,
          jsonb_build_object('permission_id', p_id, 'student_id', v_p.student_id, 'note', nullif(btrim(coalesce(p_note, '')), '')));
  perform private.notify(v_p.guardian_id,
    case when p_approve then 'self_dismissal' else 'self_dismissal_denied' end,
    case when p_approve then 'Self-dismissal approved for ' else 'Self-dismissal not approved for ' end
      || private.student_display_name(v_p.student_id),
    case when p_approve then 'The registrar approved your request. ' || private.student_display_name(v_p.student_id)
                             || ' may now leave school on their own within the dates and time you chose.'
         else 'The registrar did not approve your request' || coalesce(': ' || nullif(btrim(p_note), ''), '.') end);
  return jsonb_build_object('ok', true);
end;
$$;

-- Guard: students allowed to leave on their own today.
create or replace function public.self_dismissal_today()
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  perform private.require_verified_guard();
  return query
    select private.self_dismissal_json(p) || jsonb_build_object(
             'student_name', s.first_name || ' ' || s.last_name,
             'grade_level', s.grade_level,
             'student_photo_path', s.photo_path,
             'left_at', (select max(l.scanned_at) from public.pickup_logs l
                         where l.student_id = s.id and (l.scanned_at at time zone 'Asia/Manila')::date = v_today))
    from private.self_dismissal_permissions p
    join public.students s on s.id = p.student_id
    where p.status = 'active' and v_today between p.valid_from and p.valid_to
      and s.status::text = 'Active'
      and exists (select 1 from public.student_guardians sg
                  where sg.guardian_id = p.guardian_id and sg.student_id = p.student_id and sg.access_status = 'active')
    order by s.last_name, s.first_name;
end;
$$;

-- Guard: the student is leaving now. Re-checks everything, then logs it.
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

-- Student: read-only badge.
create or replace function public.my_self_dismissal_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_student text;
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_p record;
begin
  if auth.uid() is null or not private.mfa_ok() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select student_id into v_student from public.student_accounts where auth_user_id = auth.uid();
  if v_student is null then
    return null;
  end if;
  select valid_from, valid_to, earliest_release_time, status into v_p
  from private.self_dismissal_permissions
  where student_id = v_student and status in ('active', 'pending_approval') and valid_to >= v_today
  order by valid_from limit 1;
  if not found then
    return jsonb_build_object('status', 'none');
  end if;
  return jsonb_build_object('status', v_p.status, 'valid_from', v_p.valid_from, 'valid_to', v_p.valid_to,
                            'earliest_release_time', to_char(v_p.earliest_release_time, 'FMHH12:MI AM'),
                            'today', v_today between v_p.valid_from and v_p.valid_to);
end;
$$;

-- Pickup notifications: say "left on their own" for self-dismissal (otherwise as Phase 5D).
create or replace function private.notify_pickup_logged()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_guardian uuid;
  v_name text := private.student_display_name(new.student_id);
begin
  for v_guardian in select guardian_id from public.student_guardians where student_id = new.student_id loop
    if new.method = 'self_dismissal' then
      perform private.notify(v_guardian, 'pickup',
        v_name || ' left school on their own',
        v_name || ' left school on their own (self-dismissal) at ' || private.manila_time(new.scanned_at) || '.');
    else
      perform private.notify(v_guardian, 'pickup',
        v_name || ' was picked up',
        v_name || ' was picked up by ' || coalesce(new.picked_up_by_name, 'an authorized person')
          || coalesce(' (' || new.relationship || ')', '') || ' at ' || private.manila_time(new.scanned_at) || '.');
    end if;
  end loop;
  return null;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.get_pickup_settings()', 'public.set_pickup_settings(integer, text)',
    'public.request_self_dismissal(text, date, date, text, text, text, text)',
    'public.my_self_dismissals()', 'public.revoke_self_dismissal(uuid)',
    'public.pending_self_dismissals()', 'public.decide_self_dismissal(uuid, boolean, text)',
    'public.self_dismissal_today()', 'public.confirm_self_dismissal(uuid)',
    'public.my_self_dismissal_status()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

commit;

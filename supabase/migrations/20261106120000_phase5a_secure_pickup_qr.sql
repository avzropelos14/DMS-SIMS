-- Phase 5A (C4): secret pickup QR codes, suspension, verify-then-confirm, same-day block.
-- Additive only. Old-style QR codes (names/IDs, no secret) stop being accepted: the old
-- guard_record_pickup() is kept but no longer callable by signed-in users.
-- Rollback: supabase/rollbacks/20261106120000_phase5a_secure_pickup_qr.sql

begin;

-- ─── per-link access status (admin/registrar change it; parents can't write links) ───
alter table public.student_guardians
  add column if not exists access_status text not null default 'active'
    constraint student_guardians_access_status_check check (access_status in ('active', 'suspended'));

-- ─── permanent QR secrets, kept out of student_guardians ───
-- Students can read their own student_guardians rows, so the secret lives in the private
-- schema and is handed only to the guardian themself (my_pickup_qr_codes()).
create table private.pickup_qr_secrets (
  student_guardian_id uuid primary key references public.student_guardians (id) on delete cascade,
  secret text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  rotated_at timestamptz not null default now()
);
revoke all on private.pickup_qr_secrets from public, anon, authenticated;

insert into private.pickup_qr_secrets (student_guardian_id)
select id from public.student_guardians
on conflict do nothing;

create or replace function private.student_guardians_issue_qr_secret()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into private.pickup_qr_secrets (student_guardian_id) values (new.id)
  on conflict do nothing;
  return null;
end;
$$;
revoke execute on function private.student_guardians_issue_qr_secret() from public, anon, authenticated;

create trigger student_guardians_issue_qr_secret
  after insert on public.student_guardians
  for each row execute function private.student_guardians_issue_qr_secret();

-- Temporary QR codes carry pickup_authorizations.qr_token as their secret.
create unique index if not exists pickup_authorizations_qr_token_key
  on public.pickup_authorizations (qr_token) where qr_token is not null;

-- One-time permission from the office for a second pickup of a student on the same day
-- (granted from the Guardian Security panel in Phase 5C).
create table private.pickup_day_overrides (
  student_id text not null references public.students (id) on delete cascade,
  day date not null,
  granted_by uuid,
  granted_at timestamptz not null default now(),
  used_at timestamptz,
  primary key (student_id, day)
);
revoke all on private.pickup_day_overrides from public, anon, authenticated;

create index if not exists pickup_logs_student_scanned_idx on public.pickup_logs (student_id, scanned_at desc);

-- ─── the guardian's own QR secrets ───
create or replace function public.my_pickup_qr_codes()
returns table (student_guardian_id uuid, student_id text, secret text, access_status text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not private.mfa_ok() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select sg.id, sg.student_id,
           case when sg.access_status = 'active' and coalesce(sg.can_pickup, true) then ps.secret end,
           sg.access_status
    from public.student_guardians sg
    left join private.pickup_qr_secrets ps on ps.student_guardian_id = sg.id
    where sg.guardian_id = auth.uid();
end;
$$;
revoke execute on function public.my_pickup_qr_codes() from public, anon;
grant  execute on function public.my_pickup_qr_codes() to authenticated;

-- ─── shared lookup: what a scanned code means (no side effects) ───
-- QR content v2: {"v":2,"s":"<secret>"}; the secret is a permanent link secret or a
-- temporary authorization's qr_token. Returns status 'ok', 'suspended',
-- 'already_picked_up', or an error code, plus what the guard screen shows.
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

  select sg.id, sg.student_id, sg.guardian_id, sg.relationship, sg.access_status, sg.can_pickup, g.full_name
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
    v_link_id := v_link.id;
    select s.id, s.first_name, s.last_name, s.grade_level, s.status into v_student
    from public.students s where s.id = v_link.student_id;
  else
    select pa.id, pa.student_id, pa.authorized_by, pa.guardian_name, pa.relationship, pa.valid_until, pa.status
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
    -- A suspended parent's temporary authorizations are suspended too.
    if exists (select 1 from public.student_guardians sg
               where sg.guardian_id = v_auth.authorized_by and sg.student_id = v_auth.student_id
                 and sg.access_status = 'suspended') then
      v_status := 'suspended';
    end if;
    v_guardian_name := v_auth.guardian_name;
    v_relationship := v_auth.relationship;
    v_auth_id := v_auth.id;
    select s.id, s.first_name, s.last_name, s.grade_level, s.status into v_student
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
    'guardian_name', v_guardian_name,
    'relationship', v_relationship,
    'guardian_id', v_guardian_id,
    'link_id', v_link_id,
    'auth_id', v_auth_id,
    'previous_pickup_at', v_prev_at,
    'previous_pickup_by', v_prev_by
  );
end;
$$;
revoke execute on function private.pickup_qr_lookup(text) from public, anon, authenticated;

-- ─── guard functions ───
create or replace function private.require_verified_guard()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.is_staff_role('guard'), false) is not true or not private.mfa_ok() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function private.require_verified_guard() from public, anon, authenticated;

-- Step 1: what was scanned. Records nothing.
create or replace function public.verify_pickup_qr(p_qr text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_verified_guard();
  return private.pickup_qr_lookup(p_qr);
end;
$$;

-- Step 2: the guard compared the person with the details and confirms. Re-checks the code
-- (never trusts the earlier answer), then records the pickup.
create or replace function public.confirm_pickup(p_qr text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_info jsonb;
  v_log record;
  v_school_year uuid;
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  perform private.require_verified_guard();
  v_info := private.pickup_qr_lookup(p_qr);
  if v_info ->> 'status' <> 'ok' then
    return jsonb_build_object('error', v_info ->> 'status');
  end if;

  select sy.id into v_school_year from public.school_years sy where sy.is_current limit 1;

  insert into public.pickup_logs
    (student_id, school_year_id, method, guardian_id, pickup_authorization_id,
     picked_up_by_name, relationship, scanned_by, notes)
  values
    (v_info ->> 'student_id', v_school_year,
     case when v_info ->> 'kind' = 'temporary' then 'qr_authorization' else 'qr_persistent' end,
     (v_info ->> 'guardian_id')::uuid, v_info ->> 'auth_id',
     v_info ->> 'guardian_name', v_info ->> 'relationship', public.current_employee_id(), null)
  returning id, scanned_at into v_log;

  update private.pickup_day_overrides set used_at = now()
  where student_id = v_info ->> 'student_id' and day = v_today and used_at is null;

  return jsonb_build_object('record', v_info || jsonb_build_object('id', v_log.id, 'scanned_at', v_log.scanned_at));
end;
$$;

-- The guard refused the pickup: written to the audit log for the office.
create or replace function public.reject_pickup(p_qr text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_info jsonb;
begin
  perform private.require_verified_guard();
  v_info := private.pickup_qr_lookup(p_qr);
  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (
    auth.uid(), 'guard', 'pickup_rejected',
    nullif(v_info ->> 'guardian_id', '')::uuid,
    jsonb_build_object(
      'status_at_scan', v_info ->> 'status',
      'kind', v_info ->> 'kind',
      'student_id', v_info ->> 'student_id',
      'guardian_name', v_info ->> 'guardian_name',
      'auth_id', v_info ->> 'auth_id',
      'reason', left(coalesce(p_reason, ''), 500)
    )
  );
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.verify_pickup_qr(text)     from public, anon;
revoke execute on function public.confirm_pickup(text)       from public, anon;
revoke execute on function public.reject_pickup(text, text)  from public, anon;
grant  execute on function public.verify_pickup_qr(text)     to authenticated;
grant  execute on function public.confirm_pickup(text)       to authenticated;
grant  execute on function public.reject_pickup(text, text)  to authenticated;

-- Old-style (secret-less) QR codes are no longer accepted.
revoke execute on function public.guard_record_pickup(jsonb) from authenticated;

commit;

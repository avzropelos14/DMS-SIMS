-- Rollback for 20261116010000_temp_pickup_photo_password.sql
-- Parents create temporary QRs directly again (no password or photo check), the guard no
-- longer sees the temporary pickup photo, and the photo column and storage rules are removed.
-- Photos already uploaded stay in storage (temporary/<parent id>/) until removed by the office.

begin;

drop trigger if exists pickup_authorizations_require_rpc on public.pickup_authorizations;
drop function if exists private.pickup_authorizations_require_rpc();
drop function if exists public.create_temporary_pickup(text, text, text, text, integer, text);

drop policy if exists "guardian photos parent temporary upload" on storage.objects;
drop policy if exists "guardian photos parent temporary read" on storage.objects;
drop policy if exists "guardian photos parent temporary delete" on storage.objects;

-- The scan lookup as it was before (no photo for temporary QRs).
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
    if exists (select 1 from public.student_guardians sg
               where sg.guardian_id = v_auth.authorized_by and sg.student_id = v_auth.student_id
                 and sg.access_status = 'suspended') then
      v_status := 'suspended';
    end if;
    v_guardian_name := v_auth.guardian_name;
    v_relationship := v_auth.relationship;
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

alter table public.pickup_authorizations drop column if exists photo_path;

commit;

-- Temporary pickup QR: a photo of the person picking up, and the parent's password before it
-- is created. Creating now goes only through create_temporary_pickup(), which checks the
-- password confirmation (confirm-password edge function, valid 5 minutes, used once), the
-- photo, and the details; a direct insert from a parent's browser is refused by a trigger.
-- The guard sees the photo when scanning the temporary QR.
-- Photos are stored in guardian-photos under temporary/<parent id>/.
-- Additive only. Rollback: supabase/rollbacks/20261116010000_temp_pickup_photo_password.sql

begin;

alter table public.pickup_authorizations add column if not exists photo_path text;

-- ─── storage: a parent manages photos in their own temporary/<id>/ folder ───
drop policy if exists "guardian photos parent temporary upload" on storage.objects;
create policy "guardian photos parent temporary upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'guardian-photos'
    and (storage.foldername(name))[1] = 'temporary'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and exists (select 1 from public.guardians g where g.id = (select auth.uid()))
  );

drop policy if exists "guardian photos parent temporary read" on storage.objects;
create policy "guardian photos parent temporary read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'guardian-photos'
    and (storage.foldername(name))[1] = 'temporary'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

drop policy if exists "guardian photos parent temporary delete" on storage.objects;
create policy "guardian photos parent temporary delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'guardian-photos'
    and (storage.foldername(name))[1] = 'temporary'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- ─── parents create temporary QRs only through the function below ───
create or replace function private.pickup_authorizations_require_rpc()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(public.is_admin_or_registrar(), false) then
    return new;
  end if;
  if coalesce(current_setting('sims.temp_pickup_rpc', true), '') <> '1' then
    raise exception 'Temporary QR codes are created from the Pickup page, with your password.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.pickup_authorizations_require_rpc() from public, anon, authenticated;
drop trigger if exists pickup_authorizations_require_rpc on public.pickup_authorizations;
create trigger pickup_authorizations_require_rpc before insert on public.pickup_authorizations
  for each row execute function private.pickup_authorizations_require_rpc();

-- Parent: create a temporary pickup QR. Password confirmation is checked last, so a mistake in
-- the details doesn't use it up. Returns { id } or { error }.
create or replace function public.create_temporary_pickup(
  p_student_id text, p_name text, p_relationship text, p_phone text,
  p_valid_hours integer, p_photo_path text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_relationship text := btrim(coalesce(p_relationship, ''));
  v_phone text := private.ph_mobile(p_phone);
  v_id text;
begin
  if v_uid is null or not private.mfa_ok() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  -- Linked to the student, with pickup access not suspended (locked-down guardians can't).
  if not exists (select 1 from public.student_guardians
                 where guardian_id = v_uid and student_id = p_student_id and access_status = 'active') then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  if length(v_name) < 2 or length(v_name) > 120 then
    return jsonb_build_object('error', 'invalid_name');
  end if;
  if v_relationship = '' or length(v_relationship) > 40 then
    return jsonb_build_object('error', 'invalid_relationship');
  end if;
  if v_phone is null then
    return jsonb_build_object('error', 'invalid_phone');
  end if;
  if p_valid_hours is null or p_valid_hours not in (1, 2, 3, 4, 6, 12, 24) then
    return jsonb_build_object('error', 'invalid_hours');
  end if;
  if p_photo_path is null
     or p_photo_path !~ ('^temporary/' || v_uid::text || '/[A-Za-z0-9_-]+\.jpg$')
     or not exists (select 1 from storage.objects where bucket_id = 'guardian-photos' and name = p_photo_path) then
    return jsonb_build_object('error', 'photo_required');
  end if;
  if not private.consume_password_confirmation() then
    return jsonb_build_object('error', 'password_required');
  end if;

  v_id := 'AUTH-' || (extract(epoch from clock_timestamp()) * 1000)::bigint || '-' || substr(md5(random()::text), 1, 4);
  perform set_config('sims.temp_pickup_rpc', '1', true);
  insert into public.pickup_authorizations
    (id, student_id, authorized_by, guardian_name, relationship, phone, qr_token, valid_until, status, photo_path)
  values
    (v_id, p_student_id, v_uid, v_name, v_relationship, '0' || substr(v_phone, 3), gen_random_uuid()::text,
     now() + make_interval(hours => p_valid_hours), 'active', p_photo_path);
  perform set_config('sims.temp_pickup_rpc', '', true);

  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (v_uid, 'parent', 'temporary_pickup_created', v_uid,
          jsonb_build_object('authorization_id', v_id, 'student_id', p_student_id,
                             'pickup_person', v_name, 'relationship', v_relationship,
                             'valid_hours', p_valid_hours));
  return jsonb_build_object('id', v_id);
end;
$$;
revoke execute on function public.create_temporary_pickup(text, text, text, text, integer, text) from public, anon;
grant execute on function public.create_temporary_pickup(text, text, text, text, integer, text) to authenticated;

-- ─── the guard's scan now returns the temporary pickup person's photo ───
-- Same as before (Phase 5A/5B) except the temporary branch reads pa.photo_path.
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

commit;

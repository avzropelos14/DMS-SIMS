-- Phase 5B (C4): guardian and student photos for pickup verification.
-- Additive only. Private bucket; guards/office read through short-lived signed URLs; parents
-- may only drop a new photo into their own pending folder for office approval.
-- Rollback: supabase/rollbacks/20261106180000_phase5b_pickup_photos.sql

begin;

-- ─── columns ───
alter table public.guardians
  add column if not exists photo_path text,
  add column if not exists photo_status text not null default 'none',
  add column if not exists photo_approved_by uuid,
  add column if not exists photo_approved_at timestamptz;
alter table public.guardians drop constraint if exists guardians_photo_status_check;
alter table public.guardians
  add constraint guardians_photo_status_check check (photo_status in ('none', 'pending', 'approved'));
-- (Parents can't write any of these: the Phase 4 trigger only lets them change phone.)

alter table public.students add column if not exists photo_path text;

-- A parent's submitted photo waits here (not on guardians) until the office reviews it.
create table private.guardian_photo_submissions (
  guardian_id uuid primary key references public.guardians (id) on delete cascade,
  path text not null,
  submitted_at timestamptz not null default now()
);
revoke all on private.guardian_photo_submissions from public, anon, authenticated;

-- ─── storage: private bucket, JPEG only, 200 KB cap (the app sends <= 60 KB) ───
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guardian-photos', 'guardian-photos', false, 204800, array['image/jpeg'])
on conflict (id) do nothing;

-- Guards and the office can view (the app uses 60-second signed URLs).
create policy "guardian photos staff read" on storage.objects
  for select to authenticated
  using (bucket_id = 'guardian-photos'
         and (select public.current_staff_role()) in ('full_admin', 'registrar', 'guard'));

-- Only the office adds, replaces or deletes photos.
create policy "guardian photos office insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'guardian-photos' and coalesce(public.is_admin_or_registrar(), false));
create policy "guardian photos office update" on storage.objects
  for update to authenticated
  using (bucket_id = 'guardian-photos' and coalesce(public.is_admin_or_registrar(), false))
  with check (bucket_id = 'guardian-photos' and coalesce(public.is_admin_or_registrar(), false));
create policy "guardian photos office delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'guardian-photos' and coalesce(public.is_admin_or_registrar(), false));

-- A parent may only ADD a file under pending/<their id>/ (no read, list, change or delete).
create policy "guardian photos parent submit" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'guardian-photos'
    and (storage.foldername(name))[1] = 'pending'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and exists (select 1 from public.guardians g where g.id = (select auth.uid()))
  );

-- Same MFA rule as every other protected object (Phase 3).
create policy "mfa required for guardian photos" on storage.objects
  as restrictive for all to authenticated
  using (bucket_id <> 'guardian-photos' or (select private.mfa_ok()))
  with check (bucket_id <> 'guardian-photos' or (select private.mfa_ok()));

-- ─── helpers ───
create or replace function private.require_verified_office()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.is_admin_or_registrar(), false) is not true or not private.mfa_ok() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function private.require_verified_office() from public, anon, authenticated;

-- ─── parent: submit a photo / see its status ───
create or replace function public.submit_my_guardian_photo(p_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not private.mfa_ok()
     or not exists (select 1 from public.guardians where id = v_uid) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_path !~ ('^pending/' || v_uid::text || '/[A-Za-z0-9_.-]+\.jpg$') then
    raise exception 'Invalid photo path' using errcode = '22023';
  end if;
  insert into private.guardian_photo_submissions (guardian_id, path, submitted_at)
  values (v_uid, p_path, now())
  on conflict (guardian_id) do update set path = excluded.path, submitted_at = excluded.submitted_at;
end;
$$;

create or replace function public.my_guardian_photo_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not private.mfa_ok() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'approved', exists (select 1 from public.guardians where id = v_uid and photo_status = 'approved' and photo_path is not null),
    'pending_since', (select submitted_at from private.guardian_photo_submissions where guardian_id = v_uid)
  );
end;
$$;

-- ─── office: review and capture ───
create or replace function public.pending_guardian_photos()
returns table (guardian_id uuid, full_name text, email text, path text, submitted_at timestamptz, current_photo_path text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_verified_office();
  return query
    select s.guardian_id, g.full_name, g.email, s.path, s.submitted_at, g.photo_path
    from private.guardian_photo_submissions s
    join public.guardians g on g.id = s.guardian_id
    order by s.submitted_at;
end;
$$;

-- Approve: the pending photo becomes the guardian's photo. Reject: discarded.
-- Returns the file the caller should delete from storage (old photo or rejected one).
create or replace function public.review_guardian_photo(p_guardian_id uuid, p_approve boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_sub record;
  v_old text;
begin
  perform private.require_verified_office();
  select path into v_sub from private.guardian_photo_submissions where guardian_id = p_guardian_id;
  if not found then
    return jsonb_build_object('error', 'nothing_pending');
  end if;
  delete from private.guardian_photo_submissions where guardian_id = p_guardian_id;
  if p_approve then
    select photo_path into v_old from public.guardians where id = p_guardian_id;
    update public.guardians
    set photo_path = v_sub.path, photo_status = 'approved',
        photo_approved_by = auth.uid(), photo_approved_at = now()
    where id = p_guardian_id;
  else
    v_old := v_sub.path;
  end if;
  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (auth.uid(), public.current_staff_role()::text,
          case when p_approve then 'guardian_photo_approved' else 'guardian_photo_rejected' end,
          p_guardian_id, '{}'::jsonb);
  return jsonb_build_object('delete_path', v_old);
end;
$$;

-- Photo taken at the office: approved immediately. Returns the replaced file to delete.
create or replace function public.set_guardian_photo(p_guardian_id uuid, p_path text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_old text;
begin
  perform private.require_verified_office();
  if p_path !~ ('^guardians/' || p_guardian_id::text || '/[A-Za-z0-9_.-]+\.jpg$') then
    raise exception 'Invalid photo path' using errcode = '22023';
  end if;
  select photo_path into v_old from public.guardians where id = p_guardian_id;
  if not found then
    raise exception 'Guardian not found' using errcode = 'P0002';
  end if;
  update public.guardians
  set photo_path = p_path, photo_status = 'approved',
      photo_approved_by = auth.uid(), photo_approved_at = now()
  where id = p_guardian_id;
  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (auth.uid(), public.current_staff_role()::text, 'guardian_photo_captured', p_guardian_id, '{}'::jsonb);
  return jsonb_build_object('delete_path', v_old);
end;
$$;

-- Remove a guardian's photo (e.g. retention: none of their children are still enrolled).
create or replace function public.remove_guardian_photo(p_guardian_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_old text;
begin
  perform private.require_verified_office();
  select photo_path into v_old from public.guardians where id = p_guardian_id;
  update public.guardians
  set photo_path = null, photo_status = 'none', photo_approved_by = null, photo_approved_at = null
  where id = p_guardian_id;
  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (auth.uid(), public.current_staff_role()::text, 'guardian_photo_removed', p_guardian_id, '{}'::jsonb);
  return jsonb_build_object('delete_path', v_old);
end;
$$;

create or replace function public.set_student_photo(p_student_id text, p_path text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_old text;
begin
  perform private.require_verified_office();
  if p_path is not null and p_path !~ ('^students/' || regexp_replace(p_student_id, '[^A-Za-z0-9_-]', '', 'g') || '/[A-Za-z0-9_.-]+\.jpg$') then
    raise exception 'Invalid photo path' using errcode = '22023';
  end if;
  select photo_path into v_old from public.students where id = p_student_id;
  if not found then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;
  update public.students set photo_path = p_path where id = p_student_id;
  return jsonb_build_object('delete_path', v_old);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.submit_my_guardian_photo(text)', 'public.my_guardian_photo_status()',
    'public.pending_guardian_photos()', 'public.review_guardian_photo(uuid, boolean)',
    'public.set_guardian_photo(uuid, text)', 'public.remove_guardian_photo(uuid)',
    'public.set_student_photo(text, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ─── guard lookup now also returns the photo paths (approved guardian photo only) ───
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
revoke execute on function private.pickup_qr_lookup(text) from public, anon, authenticated;

commit;

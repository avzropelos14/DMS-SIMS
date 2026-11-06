-- Phase 5C (C4): guardian lockdown and restore, per-link suspend / new QR, same-day pickup
-- overrides, and cleanup of replaced pending photos.
-- Additive only. Everything runs inside the database (no new edge function): the functions
-- below are SECURITY DEFINER and check the caller is office staff who passed MFA.
-- Rollback: supabase/rollbacks/20261106200000_phase5c_guardian_lockdown.sql

begin;

-- ─── incidents (private: read through security_incidents_open()) ───
create table private.security_incidents (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references public.guardians (id) on delete cascade,
  kind text not null default 'lockdown',
  reason text not null,
  suspended_links uuid[] not null default '{}',
  opened_by uuid,
  opened_at timestamptz not null default now(),
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text
);
create index security_incidents_open_idx on private.security_incidents (guardian_id) where resolved_at is null;
alter table private.security_incidents enable row level security;
revoke all on private.security_incidents from public, anon, authenticated;

-- Pending photo files a parent replaced before the office reviewed them. The office page
-- deletes these files from storage (parents can't delete files).
create table private.photo_cleanup_queue (
  path text primary key,
  queued_at timestamptz not null default now()
);
alter table private.photo_cleanup_queue enable row level security;
revoke all on private.photo_cleanup_queue from public, anon, authenticated;

-- ─── helpers ───
create or replace function private.require_verified_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if public.current_staff_role() is distinct from 'full_admin' or not private.mfa_ok() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function private.require_verified_admin() from public, anon, authenticated;

create or replace function private.new_qr_secret(p_link_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into private.pickup_qr_secrets (student_guardian_id, secret, rotated_at)
  values (p_link_id, encode(extensions.gen_random_bytes(16), 'hex'), now())
  on conflict (student_guardian_id)
  do update set secret = excluded.secret, rotated_at = excluded.rotated_at;
end;
$$;
revoke execute on function private.new_qr_secret(uuid) from public, anon, authenticated;

-- ─── lockdown: lost phone / suspected account takeover ───
-- Suspends every pickup link, replaces every QR code, cancels active temporary QRs, signs the
-- account out everywhere, forgets remembered devices, blocks sign-in until restored, and
-- requires a new password afterwards. Office staff (admin or registrar) may lock down.
create or replace function public.lockdown_guardian(p_guardian_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_links uuid[];
  v_link uuid;
  v_temp integer;
  v_sessions integer;
  v_incident uuid;
begin
  perform private.require_verified_office();
  if not exists (select 1 from public.guardians where id = p_guardian_id) then
    raise exception 'Guardian not found' using errcode = 'P0002';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  if exists (select 1 from private.security_incidents
             where guardian_id = p_guardian_id and resolved_at is null) then
    return jsonb_build_object('error', 'already_locked');
  end if;

  -- Remember which links were active, so restore re-opens only those.
  select coalesce(array_agg(id), '{}') into v_links
  from public.student_guardians where guardian_id = p_guardian_id and access_status = 'active';

  update public.student_guardians set access_status = 'suspended' where guardian_id = p_guardian_id;
  for v_link in select id from public.student_guardians where guardian_id = p_guardian_id loop
    perform private.new_qr_secret(v_link);
  end loop;

  update public.pickup_authorizations set status = 'revoked'
  where authorized_by = p_guardian_id and status = 'active';
  get diagnostics v_temp = row_count;

  delete from private.mfa_verified_sessions where user_id = p_guardian_id;
  delete from public.trusted_devices where user_id = p_guardian_id;
  delete from auth.sessions where user_id = p_guardian_id;
  get diagnostics v_sessions = row_count;
  update auth.users set banned_until = '2999-12-31 00:00:00+00' where id = p_guardian_id;
  perform public.mark_password_change_required(p_guardian_id, 'guardian_lockdown');

  insert into private.security_incidents (guardian_id, reason, suspended_links, opened_by)
  values (p_guardian_id, left(btrim(p_reason), 500), v_links, auth.uid())
  returning id into v_incident;

  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (auth.uid(), public.current_staff_role()::text, 'guardian_lockdown', p_guardian_id,
          jsonb_build_object('incident_id', v_incident, 'reason', left(btrim(p_reason), 500),
                             'links_suspended', coalesce(array_length(v_links, 1), 0),
                             'temporary_qrs_revoked', v_temp, 'sessions_ended', v_sessions));

  return jsonb_build_object('incident_id', v_incident,
                            'links_suspended', coalesce(array_length(v_links, 1), 0),
                            'temporary_qrs_revoked', v_temp, 'sessions_ended', v_sessions);
end;
$$;

-- ─── restore: after the guardian was verified in person. Full admin only. ───
-- Re-opens sign-in and the links the lockdown suspended. QR codes stay the new ones, and the
-- guardian must still set a new password at their next sign-in.
create or replace function public.restore_guardian_access(p_guardian_id uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_inc record;
begin
  perform private.require_verified_admin();
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'A note is required' using errcode = '22023';
  end if;
  select id, suspended_links into v_inc from private.security_incidents
  where guardian_id = p_guardian_id and resolved_at is null
  order by opened_at desc limit 1;
  if not found then
    return jsonb_build_object('error', 'not_locked');
  end if;

  update public.student_guardians set access_status = 'active'
  where guardian_id = p_guardian_id and id = any (v_inc.suspended_links);
  update auth.users set banned_until = null where id = p_guardian_id;
  update private.security_incidents
  set resolved_by = auth.uid(), resolved_at = now(), resolution_note = left(btrim(p_note), 500)
  where guardian_id = p_guardian_id and resolved_at is null;

  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (auth.uid(), 'full_admin', 'guardian_access_restored', p_guardian_id,
          jsonb_build_object('incident_id', v_inc.id, 'note', left(btrim(p_note), 500)));
  return jsonb_build_object('ok', true);
end;
$$;

-- ─── per-link controls ───
create or replace function public.set_guardian_link_access(p_link_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_guardian uuid;
begin
  perform private.require_verified_office();
  if p_status not in ('active', 'suspended') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  select guardian_id into v_guardian from public.student_guardians where id = p_link_id;
  if not found then
    raise exception 'Link not found' using errcode = 'P0002';
  end if;
  if p_status = 'active' and exists (select 1 from private.security_incidents
                                     where guardian_id = v_guardian and resolved_at is null) then
    return jsonb_build_object('error', 'guardian_locked');
  end if;
  update public.student_guardians set access_status = p_status where id = p_link_id;
  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (auth.uid(), public.current_staff_role()::text,
          case when p_status = 'active' then 'pickup_link_reactivated' else 'pickup_link_suspended' end,
          v_guardian, jsonb_build_object('link_id', p_link_id));
  return jsonb_build_object('ok', true);
end;
$$;

-- Replace one link's QR code (the old one stops working at once).
create or replace function public.rotate_guardian_link_qr(p_link_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_guardian uuid;
begin
  perform private.require_verified_office();
  select guardian_id into v_guardian from public.student_guardians where id = p_link_id;
  if not found then
    raise exception 'Link not found' using errcode = 'P0002';
  end if;
  perform private.new_qr_secret(p_link_id);
  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (auth.uid(), public.current_staff_role()::text, 'pickup_qr_replaced', v_guardian,
          jsonb_build_object('link_id', p_link_id));
  return jsonb_build_object('ok', true);
end;
$$;

-- What the office page shows for one guardian.
create or replace function public.guardian_security_status(p_guardian_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_inc record;
begin
  perform private.require_verified_office();
  select id, reason, opened_at into v_inc from private.security_incidents
  where guardian_id = p_guardian_id and resolved_at is null
  order by opened_at desc limit 1;
  return jsonb_build_object(
    'locked', v_inc.id is not null,
    'incident_reason', v_inc.reason,
    'incident_opened_at', v_inc.opened_at,
    'must_change_password', exists (select 1 from private.password_change_required where user_id = p_guardian_id),
    'active_temporary_qrs', (select count(*) from public.pickup_authorizations
                             where authorized_by = p_guardian_id and status = 'active' and valid_until > now()),
    'qr_rotated_at', (select coalesce(jsonb_object_agg(sg.id, ps.rotated_at), '{}'::jsonb)
                      from public.student_guardians sg
                      join private.pickup_qr_secrets ps on ps.student_guardian_id = sg.id
                      where sg.guardian_id = p_guardian_id)
  );
end;
$$;

-- Every guardian currently locked down.
create or replace function public.security_incidents_open()
returns table (guardian_id uuid, full_name text, email text, reason text, opened_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_verified_office();
  return query
    select i.guardian_id, g.full_name, g.email, i.reason, i.opened_at
    from private.security_incidents i
    join public.guardians g on g.id = i.guardian_id
    where i.resolved_at is null
    order by i.opened_at desc;
end;
$$;

-- ─── same-day pickup override (one extra pickup today, e.g. student came back) ───
create or replace function public.grant_pickup_override(p_student_id text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  perform private.require_verified_office();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.students where id = p_student_id) then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;
  insert into private.pickup_day_overrides (student_id, day, granted_by, granted_at, used_at)
  values (p_student_id, v_today, auth.uid(), now(), null)
  on conflict (student_id, day)
  do update set granted_by = excluded.granted_by, granted_at = excluded.granted_at, used_at = null;
  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (auth.uid(), public.current_staff_role()::text, 'pickup_override_granted', null,
          jsonb_build_object('student_id', p_student_id, 'day', v_today, 'reason', left(btrim(p_reason), 500)));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pickup_overrides_today()
returns table (student_id text, student_name text, granted_at timestamptz, used_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_verified_office();
  return query
    select o.student_id, s.first_name || ' ' || s.last_name, o.granted_at, o.used_at
    from private.pickup_day_overrides o
    join public.students s on s.id = o.student_id
    where o.day = (now() at time zone 'Asia/Manila')::date
    order by o.granted_at desc;
end;
$$;

-- ─── replaced pending photos: queue the old file for deletion ───
create or replace function public.submit_my_guardian_photo(p_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_prev text;
begin
  if v_uid is null or not private.mfa_ok()
     or not exists (select 1 from public.guardians where id = v_uid) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_path !~ ('^pending/' || v_uid::text || '/[A-Za-z0-9_.-]+\.jpg$') then
    raise exception 'Invalid photo path' using errcode = '22023';
  end if;
  select path into v_prev from private.guardian_photo_submissions where guardian_id = v_uid;
  if v_prev is not null and v_prev <> p_path then
    insert into private.photo_cleanup_queue (path) values (v_prev) on conflict do nothing;
  end if;
  insert into private.guardian_photo_submissions (guardian_id, path, submitted_at)
  values (v_uid, p_path, now())
  on conflict (guardian_id) do update set path = excluded.path, submitted_at = excluded.submitted_at;
end;
$$;

create or replace function public.photo_cleanup_list()
returns setof text language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_verified_office();
  return query select path from private.photo_cleanup_queue order by queued_at limit 100;
end;
$$;

create or replace function public.photo_cleanup_done(p_paths text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_verified_office();
  delete from private.photo_cleanup_queue where path = any (p_paths);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.lockdown_guardian(uuid, text)', 'public.restore_guardian_access(uuid, text)',
    'public.set_guardian_link_access(uuid, text)', 'public.rotate_guardian_link_qr(uuid)',
    'public.guardian_security_status(uuid)', 'public.security_incidents_open()',
    'public.grant_pickup_override(text, text)', 'public.pickup_overrides_today()',
    'public.submit_my_guardian_photo(text)', 'public.photo_cleanup_list()',
    'public.photo_cleanup_done(text[])'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

commit;

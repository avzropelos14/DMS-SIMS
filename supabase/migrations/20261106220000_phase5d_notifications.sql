-- Phase 5D (C4): in-app notifications for parents, plus one exception email (pickup refused).
-- Additive only. Notifications are written inside the database by triggers and by the
-- functions that perform each action, so a browser can neither skip nor fake them.
-- The parent portal reads them through my_notifications() about once a minute.
-- Rollback: supabase/rollbacks/20261106220000_phase5d_notifications.sql

begin;

-- ─── storage (private: read only through the functions below) ───
create table private.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_created_idx on private.notifications (user_id, created_at desc);
alter table private.notifications enable row level security;
revoke all on private.notifications from public, anon, authenticated;

-- Pickup-refused emails already sent (one per audit entry).
create table private.notification_emails (
  audit_id bigint primary key,
  sent_at timestamptz not null default now()
);
alter table private.notification_emails enable row level security;
revoke all on private.notification_emails from public, anon, authenticated;

create or replace function private.notify(p_user uuid, p_kind text, p_title text, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null then return; end if;
  insert into private.notifications (user_id, kind, title, body)
  values (p_user, p_kind, left(p_title, 200), left(p_body, 1000));
end;
$$;
revoke execute on function private.notify(uuid, text, text, text) from public, anon, authenticated;

create or replace function private.student_display_name(p_student_id text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select s.first_name || ' ' || s.last_name from public.students s where s.id = p_student_id), 'Your child');
$$;
revoke execute on function private.student_display_name(text) from public, anon, authenticated;

create or replace function private.manila_time(p_at timestamptz)
returns text language sql stable set search_path = '' as $$
  select to_char(p_at at time zone 'Asia/Manila', 'FMHH12:MI AM, Mon FMDD');
$$;
revoke execute on function private.manila_time(timestamptz) from public, anon, authenticated;

-- ─── triggers ───
-- A pickup was recorded: every guardian linked to the student is told.
create or replace function private.notify_pickup_logged()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_guardian uuid;
  v_name text := private.student_display_name(new.student_id);
begin
  for v_guardian in select guardian_id from public.student_guardians where student_id = new.student_id loop
    perform private.notify(v_guardian, 'pickup',
      v_name || ' was picked up',
      v_name || ' was picked up by ' || coalesce(new.picked_up_by_name, 'an authorized person')
        || coalesce(' (' || new.relationship || ')', '') || ' at ' || private.manila_time(new.scanned_at) || '.');
  end loop;
  return null;
end;
$$;
revoke execute on function private.notify_pickup_logged() from public, anon, authenticated;
create trigger pickup_logs_notify after insert on public.pickup_logs
  for each row execute function private.notify_pickup_logged();

-- Pickup access of one link changed.
create or replace function private.notify_link_access()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name text := private.student_display_name(new.student_id);
begin
  if new.access_status is distinct from old.access_status then
    if new.access_status = 'suspended' then
      perform private.notify(new.guardian_id, 'pickup_suspended',
        'Pickup suspended for ' || v_name,
        'The school office suspended your pickup QR code for ' || v_name
          || '. Please contact the school office if you did not expect this.');
    else
      perform private.notify(new.guardian_id, 'pickup_reactivated',
        'Pickup re-activated for ' || v_name,
        'Your pickup QR code for ' || v_name || ' works again. Use the code shown in your Pickup page.');
    end if;
  end if;
  return null;
end;
$$;
revoke execute on function private.notify_link_access() from public, anon, authenticated;
create trigger student_guardians_notify_access after update of access_status on public.student_guardians
  for each row execute function private.notify_link_access();

-- A link got a new QR code (skipped while the link is suspended, e.g. during a lockdown,
-- where the suspension notice already says enough).
create or replace function private.notify_qr_rotated()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_link record;
begin
  if new.secret is distinct from old.secret then
    select guardian_id, student_id, access_status into v_link
    from public.student_guardians where id = new.student_guardian_id;
    if found and v_link.access_status = 'active' then
      perform private.notify(v_link.guardian_id, 'qr_replaced',
        'New pickup QR code for ' || private.student_display_name(v_link.student_id),
        'The school office issued a new pickup QR code. Your old code and any screenshots of it no longer work. '
          || 'Open the Pickup page to see the new one.');
    end if;
  end if;
  return null;
end;
$$;
revoke execute on function private.notify_qr_rotated() from public, anon, authenticated;
create trigger pickup_qr_secrets_notify after update of secret on private.pickup_qr_secrets
  for each row execute function private.notify_qr_rotated();

-- Lockdown resolved.
create or replace function private.notify_access_restored()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.resolved_at is null and new.resolved_at is not null then
    perform private.notify(new.guardian_id, 'access_restored',
      'Your account access was restored',
      'The school office restored your account after checking your identity. Your pickup QR codes are new; '
        || 'use the ones shown in your Pickup page.');
  end if;
  return null;
end;
$$;
revoke execute on function private.notify_access_restored() from public, anon, authenticated;
create trigger security_incidents_notify after update on private.security_incidents
  for each row execute function private.notify_access_restored();

-- A guard refused a pickup: every guardian of the student is told (the QR owner also gets an
-- email, sent by the notify-pickup-rejected edge function).
create or replace function private.notify_pickup_rejected()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_student text := new.details ->> 'student_id';
  v_name text;
  v_guardian uuid;
  v_reason text := nullif(btrim(new.details ->> 'reason'), '');
begin
  if new.action <> 'pickup_rejected' or v_student is null then
    return null;
  end if;
  v_name := private.student_display_name(v_student);
  for v_guardian in select guardian_id from public.student_guardians where student_id = v_student loop
    perform private.notify(v_guardian, 'pickup_refused',
      'Pickup of ' || v_name || ' was refused',
      'A guard refused a pickup of ' || v_name || ' at ' || private.manila_time(new.created_at)
        || coalesce(' (QR of ' || nullif(new.details ->> 'guardian_name', '') || ')', '')
        || coalesce('. Reason: ' || v_reason, '')
        || '. If this was not you or someone you sent, contact the school office right away.');
  end loop;
  return null;
end;
$$;
revoke execute on function private.notify_pickup_rejected() from public, anon, authenticated;
create trigger audit_log_notify_pickup_rejected after insert on public.audit_log
  for each row when (new.action = 'pickup_rejected')
  execute function private.notify_pickup_rejected();

-- ─── photo review now tells the parent (same as Phase 5B plus the notification) ───
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
    perform private.notify(p_guardian_id, 'photo_approved', 'Pickup photo approved',
      'Your pickup photo was approved. Guards will see it when you pick up your child.');
  else
    v_old := v_sub.path;
    perform private.notify(p_guardian_id, 'photo_rejected', 'Pickup photo not approved',
      'The school office could not approve your pickup photo. Please submit a clear photo of your face '
        || '(no sunglasses or hat, plain background) from the Pickup page.');
  end if;
  insert into public.audit_log (actor_id, actor_role, action, target_user_id, details)
  values (auth.uid(), public.current_staff_role()::text,
          case when p_approve then 'guardian_photo_approved' else 'guardian_photo_rejected' end,
          p_guardian_id, '{}'::jsonb);
  return jsonb_build_object('delete_path', v_old);
end;
$$;

-- ─── reject_pickup now also returns the audit entry id (for the email) ───
create or replace function public.reject_pickup(p_qr text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_info jsonb;
  v_id bigint;
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
  )
  returning id into v_id;
  return jsonb_build_object('ok', true, 'audit_id', v_id);
end;
$$;

-- ─── parent-facing functions ───
create or replace function public.my_notifications(p_limit integer default 30)
returns table (id bigint, kind text, title text, body text, created_at timestamptz, read_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not private.mfa_ok() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select n.id, n.kind, n.title, n.body, n.created_at, n.read_at
    from private.notifications n
    where n.user_id = auth.uid()
    order by n.created_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

-- Marks the given notifications (or all, when null) as read. Also drops this user's
-- notifications older than 60 days, so the table never grows without bound.
create or replace function public.mark_my_notifications_read(p_ids bigint[] default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.mfa_ok() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update private.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  delete from private.notifications
  where user_id = auth.uid() and created_at < now() - interval '60 days';
end;
$$;

revoke execute on function public.my_notifications(integer) from public, anon;
revoke execute on function public.mark_my_notifications_read(bigint[]) from public, anon;
revoke execute on function public.review_guardian_photo(uuid, boolean) from public, anon;
revoke execute on function public.reject_pickup(text, text) from public, anon;
grant  execute on function public.my_notifications(integer) to authenticated;
grant  execute on function public.mark_my_notifications_read(bigint[]) to authenticated;
grant  execute on function public.review_guardian_photo(uuid, boolean) to authenticated;
grant  execute on function public.reject_pickup(text, text) to authenticated;

-- ─── for the notify-pickup-rejected edge function only (service role) ───
-- Checks the refusal was just recorded by this guard, claims it so it is emailed once, and
-- returns where to send it. Returns null when nothing should be sent.
create or replace function public.claim_pickup_rejection_email(p_audit_id bigint, p_guard_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row record;
  v_guardian uuid;
  v_email text;
  v_name text;
begin
  select id, actor_id, created_at, target_user_id, details into v_row
  from public.audit_log where id = p_audit_id and action = 'pickup_rejected';
  if not found or v_row.actor_id is distinct from p_guard_id
     or v_row.created_at < now() - interval '10 minutes' then
    return null;
  end if;
  v_guardian := v_row.target_user_id;
  if v_guardian is null and (v_row.details ->> 'auth_id') is not null then
    select authorized_by into v_guardian from public.pickup_authorizations where id = v_row.details ->> 'auth_id';
  end if;
  select email, full_name into v_email, v_name from public.guardians where id = v_guardian;
  if v_email is null then
    return null;
  end if;
  insert into private.notification_emails (audit_id) values (p_audit_id) on conflict do nothing;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'email', v_email,
    'guardian_name', v_name,
    'student_name', private.student_display_name(v_row.details ->> 'student_id'),
    'when', private.manila_time(v_row.created_at),
    'reason', nullif(btrim(v_row.details ->> 'reason'), '')
  );
end;
$$;
revoke execute on function public.claim_pickup_rejection_email(bigint, uuid) from public, anon, authenticated;
grant  execute on function public.claim_pickup_rejection_email(bigint, uuid) to service_role;

commit;

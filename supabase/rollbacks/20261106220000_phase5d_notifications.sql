-- Rollback for 20261106220000_phase5d_notifications.sql
-- Removes notifications (their contents are lost) and restores the Phase 5A reject_pickup and
-- the Phase 5B review_guardian_photo.

begin;

drop trigger if exists pickup_logs_notify on public.pickup_logs;
drop trigger if exists student_guardians_notify_access on public.student_guardians;
drop trigger if exists pickup_qr_secrets_notify on private.pickup_qr_secrets;
drop trigger if exists security_incidents_notify on private.security_incidents;
drop trigger if exists audit_log_notify_pickup_rejected on public.audit_log;

drop function if exists private.notify_pickup_logged();
drop function if exists private.notify_link_access();
drop function if exists private.notify_qr_rotated();
drop function if exists private.notify_access_restored();
drop function if exists private.notify_pickup_rejected();
drop function if exists public.my_notifications(integer);
drop function if exists public.mark_my_notifications_read(bigint[]);
drop function if exists public.claim_pickup_rejection_email(bigint, uuid);

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

drop function if exists private.notify(uuid, text, text, text);
drop function if exists private.student_display_name(text);
drop function if exists private.manila_time(timestamptz);
drop table if exists private.notification_emails;
drop table if exists private.notifications;

commit;

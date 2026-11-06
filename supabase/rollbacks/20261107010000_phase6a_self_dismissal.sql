-- Rollback for 20261107010000_phase6a_self_dismissal.sql
-- Removes self-dismissal (permissions are lost). Existing pickup_logs rows with
-- method 'self_dismissal' are kept, so the method check keeps allowing that value.

begin;

drop function if exists public.get_pickup_settings();
drop function if exists public.set_pickup_settings(integer, text);
drop function if exists public.request_self_dismissal(text, date, date, text, text, text, text);
drop function if exists public.my_self_dismissals();
drop function if exists public.revoke_self_dismissal(uuid);
drop function if exists public.pending_self_dismissals();
drop function if exists public.decide_self_dismissal(uuid, boolean, text);
drop function if exists public.self_dismissal_today();
drop function if exists public.confirm_self_dismissal(uuid);
drop function if exists public.my_self_dismissal_status();
drop function if exists public.record_password_confirmation(uuid);
drop function if exists private.consume_password_confirmation();
drop function if exists private.self_dismissal_json(private.self_dismissal_permissions);
drop function if exists private.pickup_setting(text);
drop function if exists private.grade_number(text);

-- Phase 5D pickup notification text.
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

drop table if exists private.self_dismissal_permissions;
drop table if exists private.password_confirmations;
drop table if exists private.pickup_settings;

commit;
